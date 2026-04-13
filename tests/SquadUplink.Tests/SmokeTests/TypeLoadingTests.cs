using System.Reflection;
using System.Runtime.CompilerServices;
using SquadUplink.Helpers;
using Xunit;

namespace SquadUplink.Tests.SmokeTests;

/// <summary>
/// Smoke tests that verify every type in the assembly can be loaded without
/// TypeLoadException. These tests would have caught the launch crash before shipping.
/// </summary>
public class TypeLoadingTests
{
    private static readonly Assembly AppAssembly =
        typeof(ServiceCollectionExtensions).Assembly;

    [Fact]
    public void AllTypesInAssembly_CanBeEnumerated()
    {
        try
        {
            var types = AppAssembly.GetTypes();
            Assert.NotEmpty(types);
        }
        catch (ReflectionTypeLoadException ex)
        {
            var failedTypes = ex.LoaderExceptions
                ?.Where(e => e is not null)
                .Select(e => e!.Message)
                .ToArray() ?? [];

            Assert.Fail(
                $"Failed to load {failedTypes.Length} types: {string.Join("; ", failedTypes)}");
        }
    }

    [Fact]
    public void AllTypesInAssembly_CanBeLoaded()
    {
        Type[] types;
        try
        {
            types = AppAssembly.GetTypes();
        }
        catch (ReflectionTypeLoadException ex)
        {
            types = ex.Types.Where(t => t is not null).ToArray()!;
        }

        var exceptions = new List<(string TypeName, Exception Error)>();

        foreach (var type in types)
        {
            try
            {
                // Force the CLR to fully resolve the type's metadata
                RuntimeHelpers.RunClassConstructor(type.TypeHandle);
            }
            catch (Exception ex) when (ex is TypeLoadException or TypeInitializationException)
            {
                exceptions.Add((type.FullName ?? type.Name, ex));
            }
        }

        if (exceptions.Count > 0)
        {
            var details = string.Join(Environment.NewLine,
                exceptions.Select(e => $"  {e.TypeName}: {e.Error.Message}"));
            Assert.Fail($"Failed to load {exceptions.Count} types:{Environment.NewLine}{details}");
        }
    }

    [Fact]
    public void AssemblyReferences_AllResolvable()
    {
        var referencedAssemblies = AppAssembly.GetReferencedAssemblies();
        var failures = new List<string>();

        foreach (var asmName in referencedAssemblies)
        {
            try
            {
                Assembly.Load(asmName);
            }
            catch (Exception ex)
            {
                failures.Add($"{asmName.FullName}: {ex.Message}");
            }
        }

        if (failures.Count > 0)
        {
            Assert.Fail(
                $"Failed to load {failures.Count} referenced assemblies:{Environment.NewLine}" +
                string.Join(Environment.NewLine, failures));
        }
    }

    [Fact]
    public void CoreAssembly_HasExpectedName()
    {
        var coreAssembly = typeof(SquadUplink.Core.CoreInfo).Assembly;
        Assert.Equal("SquadUplink.Core", coreAssembly.GetName().Name);
    }

    [Fact]
    public void AppAssembly_HasExpectedName()
    {
        Assert.Equal("SquadUplink", AppAssembly.GetName().Name);
    }
}
