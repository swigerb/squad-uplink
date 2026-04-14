using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Text;

namespace SquadUplink.Helpers;

internal static class NativeMethods
{
    [DllImport("kernel32.dll", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    internal static extern bool AttachConsole(uint dwProcessId);

    [DllImport("kernel32.dll", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    internal static extern bool FreeConsole();

    [DllImport("kernel32.dll", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    internal static extern bool GenerateConsoleCtrlEvent(uint dwCtrlEvent, uint dwProcessGroupId);

    [DllImport("kernel32.dll", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    internal static extern bool SetConsoleCtrlHandler(ConsoleCtrlHandlerRoutine? handler, [MarshalAs(UnmanagedType.Bool)] bool add);

    internal delegate bool ConsoleCtrlHandlerRoutine(uint dwCtrlType);

    // --- Process working directory via PEB reading ---

    [DllImport("ntdll.dll")]
    private static extern int NtQueryInformationProcess(
        IntPtr processHandle,
        int processInformationClass,
        ref PROCESS_BASIC_INFORMATION processInformation,
        int processInformationLength,
        out int returnLength);

    [DllImport("kernel32.dll", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool ReadProcessMemory(
        IntPtr hProcess,
        IntPtr lpBaseAddress,
        byte[] lpBuffer,
        int dwSize,
        out IntPtr lpNumberOfBytesRead);

    [StructLayout(LayoutKind.Sequential)]
    private struct PROCESS_BASIC_INFORMATION
    {
        public IntPtr Reserved1;
        public IntPtr PebBaseAddress;
        public IntPtr Reserved2_0;
        public IntPtr Reserved2_1;
        public IntPtr UniqueProcessId;
        public IntPtr Reserved3;
    }

    /// <summary>
    /// Reads the current working directory of a process by reading its PEB
    /// via NtQueryInformationProcess + ReadProcessMemory.
    /// </summary>
    internal static string? GetProcessWorkingDirectory(int pid)
    {
        try
        {
            using var process = Process.GetProcessById(pid);
            var handle = process.Handle;

            var pbi = new PROCESS_BASIC_INFORMATION();
            int status = NtQueryInformationProcess(handle, 0, ref pbi, Marshal.SizeOf(pbi), out _);
            if (status != 0) return null;

            // Read PEB + 0x20 → ProcessParameters pointer (x64)
            var buffer = new byte[8];
            if (!ReadProcessMemory(handle, pbi.PebBaseAddress + 0x20, buffer, 8, out _))
                return null;
            var processParametersPtr = (IntPtr)BitConverter.ToInt64(buffer, 0);

            // Read ProcessParameters + 0x38 → CurrentDirectory.DosPath.Length (USHORT)
            buffer = new byte[2];
            if (!ReadProcessMemory(handle, processParametersPtr + 0x38, buffer, 2, out _))
                return null;
            var length = BitConverter.ToUInt16(buffer, 0);
            if (length == 0 || length > 4096) return null;

            // Read ProcessParameters + 0x40 → CurrentDirectory.DosPath.Buffer pointer (x64)
            buffer = new byte[8];
            if (!ReadProcessMemory(handle, processParametersPtr + 0x40, buffer, 8, out _))
                return null;
            var bufferPtr = (IntPtr)BitConverter.ToInt64(buffer, 0);

            // Read the actual directory string (UTF-16)
            buffer = new byte[length];
            if (!ReadProcessMemory(handle, bufferPtr, buffer, length, out _))
                return null;

            return Encoding.Unicode.GetString(buffer).TrimEnd('\\');
        }
        catch
        {
            return null;
        }
    }
}
