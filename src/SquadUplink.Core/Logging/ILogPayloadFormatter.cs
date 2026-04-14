namespace SquadUplink.Core.Logging;

public enum PayloadType { PlainText, Json, StackTrace, CommandOutput }

public interface ILogPayloadFormatter
{
    PayloadType DetectPayloadType(string message);
    string FormatPayload(string message);
}
