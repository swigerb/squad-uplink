using System.Net;
using System.Text.Json;
using Serilog;
using SquadUplink.Contracts;
using SquadUplink.Models;

namespace SquadUplink.Services;

/// <summary>
/// Lightweight HTTP listener that accepts OTLP JSON payloads on
/// <c>http://localhost:4318/v1/metrics</c>. Extracts <c>gen_ai.client.token.usage</c>
/// metrics and feeds them into <see cref="ITelemetryService"/>.
/// </summary>
public sealed class OtlpListener : IDisposable
{
    private readonly ITelemetryService _telemetryService;
    private HttpListener? _listener;
    private CancellationTokenSource? _cts;
    private Task? _listenTask;

    public const string DefaultEndpoint = "http://localhost:4318/";

    public bool IsRunning => _listener?.IsListening == true;

    public OtlpListener(ITelemetryService telemetryService)
    {
        _telemetryService = telemetryService;
    }

    public void Start(string? endpoint = null)
    {
        if (_listener is not null) return;

        var prefix = endpoint ?? DefaultEndpoint;
        _listener = new HttpListener();
        _listener.Prefixes.Add(prefix);
        _cts = new CancellationTokenSource();

        try
        {
            _listener.Start();
            Log.Information("OTLP listener started on {Endpoint}", prefix);
            _listenTask = AcceptLoopAsync(_cts.Token);
        }
        catch (HttpListenerException ex)
        {
            Log.Warning(ex, "Failed to start OTLP listener on {Endpoint} — port may be in use", prefix);
            _listener = null;
        }
    }

    public void Stop()
    {
        _cts?.Cancel();
        _listener?.Close();
        _listener = null;
        try { _listenTask?.Wait(TimeSpan.FromSeconds(2)); }
        catch (AggregateException ex) { Log.Debug(ex, "OTLP listen task completed with errors"); }
        catch (OperationCanceledException) { /* expected on shutdown */ }
        Log.Information("OTLP listener stopped");
    }

    public void Dispose()
    {
        Stop();
        _cts?.Dispose();
    }

    private async Task AcceptLoopAsync(CancellationToken ct)
    {
        while (!ct.IsCancellationRequested && _listener is { IsListening: true })
        {
            try
            {
                var context = await _listener.GetContextAsync().WaitAsync(ct);
                _ = HandleRequestAsync(context).ContinueWith(
                    t => Log.Warning(t.Exception, "Unhandled OTLP request error"),
                    TaskContinuationOptions.OnlyOnFaulted);
            }
            catch (OperationCanceledException)
            {
                break;
            }
            catch (HttpListenerException) when (ct.IsCancellationRequested)
            {
                break;
            }
            catch (Exception ex)
            {
                Log.Debug(ex, "OTLP listener accept error");
            }
        }
    }

    internal async Task HandleRequestAsync(HttpListenerContext context)
    {
        try
        {
            var request = context.Request;
            var response = context.Response;

            if (request.HttpMethod == "POST" && request.Url?.AbsolutePath == "/v1/metrics")
            {
                using var reader = new StreamReader(request.InputStream, request.ContentEncoding);
                var body = await reader.ReadToEndAsync();
                var count = await ParseAndRecordMetricsAsync(body);

                Log.Debug("OTLP metrics received: {Count} records extracted", count);

                response.StatusCode = 200;
                response.ContentType = "application/json";
                await using var writer = new StreamWriter(response.OutputStream);
                await writer.WriteAsync("{}");
            }
            else
            {
                response.StatusCode = 404;
            }

            response.Close();
        }
        catch (Exception ex)
        {
            Log.Debug(ex, "Error handling OTLP request");
            try { context.Response.StatusCode = 500; context.Response.Close(); }
            catch (Exception innerEx) { Log.Debug(innerEx, "Failed to send 500 response"); }
        }
    }

    /// <summary>
    /// Parse OTLP JSON metric export and extract gen_ai token usage data points.
    /// Returns the number of records extracted.
    /// </summary>
    internal async Task<int> ParseAndRecordMetricsAsync(string json)
    {
        int count = 0;
        try
        {
            using var doc = JsonDocument.Parse(json);
            var root = doc.RootElement;

            if (!root.TryGetProperty("resourceMetrics", out var resourceMetrics))
                return 0;

            foreach (var rm in resourceMetrics.EnumerateArray())
            {
                if (!rm.TryGetProperty("scopeMetrics", out var scopeMetrics))
                    continue;

                foreach (var sm in scopeMetrics.EnumerateArray())
                {
                    if (!sm.TryGetProperty("metrics", out var metrics))
                        continue;

                    foreach (var metric in metrics.EnumerateArray())
                    {
                        var name = metric.TryGetProperty("name", out var n) ? n.GetString() : null;
                        if (name is not "gen_ai.client.token.usage") continue;

                        var records = ExtractTokenRecords(metric);
                        foreach (var record in records)
                        {
                            await _telemetryService.RecordTokenUsageAsync(record);
                            count++;
                        }
                    }
                }
            }
        }
        catch (JsonException ex)
        {
            Log.Debug(ex, "Failed to parse OTLP JSON payload");
        }

        return count;
    }

    private static List<TokenUsageRecord> ExtractTokenRecords(JsonElement metric)
    {
        var results = new List<TokenUsageRecord>();

        // OTLP metrics can be in sum or histogram data points
        JsonElement dataPoints;
        if (metric.TryGetProperty("sum", out var sum) && sum.TryGetProperty("dataPoints", out dataPoints))
        {
            // fall through
        }
        else if (metric.TryGetProperty("histogram", out var hist) && hist.TryGetProperty("dataPoints", out dataPoints))
        {
            // fall through
        }
        else
        {
            return results;
        }

        foreach (var dp in dataPoints.EnumerateArray())
        {
            var attrs = new Dictionary<string, string>();
            if (dp.TryGetProperty("attributes", out var attrArray))
            {
                foreach (var attr in attrArray.EnumerateArray())
                {
                    var key = attr.TryGetProperty("key", out var k) ? k.GetString() ?? "" : "";
                    var value = attr.TryGetProperty("value", out var v) && v.TryGetProperty("stringValue", out var sv)
                        ? sv.GetString() ?? ""
                        : "";
                    attrs[key] = value;
                }
            }

            attrs.TryGetValue("gen_ai.usage.token_type", out var tokenType);
            var isInput = tokenType == "input" || tokenType == "prompt";

            int tokenCount = 0;
            if (dp.TryGetProperty("asInt", out var asInt))
                tokenCount = (int)asInt.GetInt64();
            else if (dp.TryGetProperty("asDouble", out var asDouble))
                tokenCount = (int)asDouble.GetDouble();

            attrs.TryGetValue("gen_ai.request.model", out var model);
            attrs.TryGetValue("session.id", out var sessionId);
            attrs.TryGetValue("gen_ai.agent.name", out var agentName);

            model ??= "unknown";
            sessionId ??= "unknown";
            agentName ??= "unknown";

            var inputTokens = isInput ? tokenCount : 0;
            var outputTokens = isInput ? 0 : tokenCount;
            var cost = ModelPricing.CalculateCost(model, inputTokens, outputTokens);

            results.Add(new TokenUsageRecord
            {
                SessionId = sessionId,
                AgentName = agentName,
                ModelName = model,
                InputTokens = inputTokens,
                OutputTokens = outputTokens,
                EstimatedCost = cost,
                Timestamp = DateTime.UtcNow
            });
        }

        return results;
    }
}
