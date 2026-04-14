using System.Net;
using System.Text;
using SquadUplink.Models;
using SquadUplink.Services;
using Xunit;

namespace SquadUplink.Tests.Services;

public class OtlpListenerTests : IDisposable
{
    private readonly string _dbPath;
    private readonly DataService _dataService;
    private readonly TelemetryService _telemetryService;
    private readonly OtlpListener _listener;

    public OtlpListenerTests()
    {
        _dbPath = Path.Combine(Path.GetTempPath(), $"squad-uplink-otlp-test-{Guid.NewGuid()}.db");
        _dataService = new DataService(_dbPath);
        _telemetryService = new TelemetryService(_dataService);
        _listener = new OtlpListener(_telemetryService);
    }

    public void Dispose()
    {
        _listener.Dispose();
        try { File.Delete(_dbPath); } catch { }
    }

    [Fact]
    public async Task ParseAndRecordMetrics_ValidPayload_ExtractsRecords()
    {
        await _dataService.InitializeAsync();

        var payload = """
        {
            "resourceMetrics": [{
                "scopeMetrics": [{
                    "metrics": [{
                        "name": "gen_ai.client.token.usage",
                        "sum": {
                            "dataPoints": [{
                                "asInt": 1500,
                                "attributes": [
                                    { "key": "gen_ai.usage.token_type", "value": { "stringValue": "input" } },
                                    { "key": "gen_ai.request.model", "value": { "stringValue": "gpt-4o" } },
                                    { "key": "session.id", "value": { "stringValue": "sess-42" } },
                                    { "key": "gen_ai.agent.name", "value": { "stringValue": "Woz" } }
                                ]
                            }]
                        }
                    }]
                }]
            }]
        }
        """;

        var count = await _listener.ParseAndRecordMetricsAsync(payload);

        Assert.Equal(1, count);
        var metrics = _telemetryService.GetCurrentMetrics();
        Assert.Equal(1500, metrics.TotalInputTokens);
        Assert.Equal(0, metrics.TotalOutputTokens);
    }

    [Fact]
    public async Task ParseAndRecordMetrics_OutputTokens_Recognized()
    {
        await _dataService.InitializeAsync();

        var payload = """
        {
            "resourceMetrics": [{
                "scopeMetrics": [{
                    "metrics": [{
                        "name": "gen_ai.client.token.usage",
                        "sum": {
                            "dataPoints": [{
                                "asInt": 800,
                                "attributes": [
                                    { "key": "gen_ai.usage.token_type", "value": { "stringValue": "output" } },
                                    { "key": "gen_ai.request.model", "value": { "stringValue": "claude-sonnet-4.5" } },
                                    { "key": "session.id", "value": { "stringValue": "sess-99" } },
                                    { "key": "gen_ai.agent.name", "value": { "stringValue": "Ada" } }
                                ]
                            }]
                        }
                    }]
                }]
            }]
        }
        """;

        var count = await _listener.ParseAndRecordMetricsAsync(payload);

        Assert.Equal(1, count);
        var metrics = _telemetryService.GetCurrentMetrics();
        Assert.Equal(0, metrics.TotalInputTokens);
        Assert.Equal(800, metrics.TotalOutputTokens);
    }

    [Fact]
    public async Task ParseAndRecordMetrics_NonTokenMetric_Ignored()
    {
        await _dataService.InitializeAsync();

        var payload = """
        {
            "resourceMetrics": [{
                "scopeMetrics": [{
                    "metrics": [{
                        "name": "http.server.request.duration",
                        "sum": {
                            "dataPoints": [{
                                "asDouble": 0.5,
                                "attributes": []
                            }]
                        }
                    }]
                }]
            }]
        }
        """;

        var count = await _listener.ParseAndRecordMetricsAsync(payload);
        Assert.Equal(0, count);
    }

    [Fact]
    public async Task ParseAndRecordMetrics_InvalidJson_ReturnsZero()
    {
        var count = await _listener.ParseAndRecordMetricsAsync("not valid json {{{");
        Assert.Equal(0, count);
    }

    [Fact]
    public async Task ParseAndRecordMetrics_EmptyPayload_ReturnsZero()
    {
        var count = await _listener.ParseAndRecordMetricsAsync("{}");
        Assert.Equal(0, count);
    }
}
