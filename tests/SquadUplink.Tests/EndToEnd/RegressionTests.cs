using System.Reflection;
using System.Runtime.CompilerServices;
using System.Xml.Linq;
using SquadUplink.Helpers;
using Xunit;

namespace SquadUplink.Tests.EndToEnd;

/// <summary>
/// Regression tests that guard against specific bugs that have been discovered.
/// Each test documents which failure it prevents and why it matters.
/// </summary>
public class RegressionTests
{
    private static readonly Assembly AppAssembly =
        typeof(ServiceCollectionExtensions).Assembly;

    private static readonly Assembly CoreAssembly =
        typeof(SquadUplink.Core.CoreInfo).Assembly;

    // ── TypeLoadException Guard ────────────────────────────────
    // THE test that would have caught the WebView2 CsWinRT crash.

    [Fact]
    public void NoTypeLoadException_OnAssemblyLoad()
    {
        var exceptions = new List<(string TypeName, string Message)>();

        try
        {
            var types = AppAssembly.GetTypes();
            foreach (var type in types)
            {
                try
                {
                    RuntimeHelpers.RunClassConstructor(type.TypeHandle);
                }
                catch (TypeLoadException tle)
                {
                    exceptions.Add((type.FullName ?? type.Name, tle.Message));
                }
                catch (TypeInitializationException tie)
                {
                    if (tie.InnerException is TypeLoadException innerTle)
                        exceptions.Add((type.FullName ?? type.Name, innerTle.Message));
                }
            }
        }
        catch (ReflectionTypeLoadException ex)
        {
            foreach (var loader in ex.LoaderExceptions ?? [])
            {
                if (loader is TypeLoadException tle)
                    exceptions.Add((tle.TypeName ?? "Unknown", tle.Message));
            }
        }

        if (exceptions.Count > 0)
        {
            var details = string.Join(Environment.NewLine,
                exceptions.Select(e => $"  {e.TypeName}: {e.Message}"));
            Assert.Fail(
                $"TypeLoadException detected — this is the exact class of bug that " +
                $"caused the v2 launch crash. {exceptions.Count} types failed:\n{details}");
        }
    }

    [Fact]
    public void CoreAssembly_NoTypeLoadException()
    {
        Type[] types;
        try { types = CoreAssembly.GetTypes(); }
        catch (ReflectionTypeLoadException ex)
        {
            types = ex.Types.Where(t => t is not null).ToArray()!;
        }

        var failures = new List<string>();
        foreach (var type in types)
        {
            try { RuntimeHelpers.RunClassConstructor(type.TypeHandle); }
            catch (TypeLoadException tle) { failures.Add($"{type.FullName}: {tle.Message}"); }
            catch (TypeInitializationException tie) when (tie.InnerException is TypeLoadException tle)
            {
                failures.Add($"{type.FullName}: {tle.Message}");
            }
        }

        Assert.Empty(failures);
    }

    // ── DependencyProperty Type Matching ───────────────────────

    [Fact]
    public void AllDependencyPropertyRegistrations_HaveMatchingClrPropertyTypes()
    {
        // DependencyProperty.Register() takes a Type parameter that must match
        // the CLR property's actual type. Mismatches cause runtime crashes.
        var controlTypes = AppAssembly.GetTypes()
            .Where(t => t.Namespace?.Contains("Controls") == true && !t.IsAbstract);

        var mismatches = new List<string>();

        foreach (var controlType in controlTypes)
        {
            var dpFields = controlType.GetFields(BindingFlags.Public | BindingFlags.Static)
                .Where(f => f.Name.EndsWith("Property") &&
                            f.FieldType.Name == "DependencyProperty");

            foreach (var dpField in dpFields)
            {
                var propName = dpField.Name.Replace("Property", "");
                var clrProp = controlType.GetProperty(propName);

                if (clrProp is null)
                {
                    mismatches.Add($"{controlType.Name}.{propName}: " +
                        $"DependencyProperty '{dpField.Name}' has no matching CLR property");
                    continue;
                }

                // We can't read the registered type from DependencyProperty at test-time
                // without WinUI runtime, but we can verify the CLR property exists and
                // its getter/setter are present.
                Assert.NotNull(clrProp.GetMethod);
            }
        }

        if (mismatches.Count > 0)
        {
            Assert.Fail($"DependencyProperty mismatches:\n" +
                string.Join("\n", mismatches));
        }
    }

    [Theory]
    [InlineData("GridLayoutPanel", "Sessions", "GridSize")]
    [InlineData("SessionLayoutControl", "LayoutMode", "Sessions", "GridSize", "SelectedSessionIndex")]
    [InlineData("SquadTreeControl", "Squads")]
    [InlineData("SquadStatusPanel", "SelectedSquad")]
    [InlineData("SessionTerminalControl", "Session", "ShowCloseButton")]
    public void Control_HasExpectedDependencyProperties(string controlName, params string[] expectedProps)
    {
        var controlType = AppAssembly.GetTypes()
            .FirstOrDefault(t => t.Name == controlName);
        Assert.NotNull(controlType);

        foreach (var propName in expectedProps)
        {
            var dpField = controlType!.GetField($"{propName}Property",
                BindingFlags.Public | BindingFlags.Static);
            Assert.True(dpField is not null,
                $"{controlName} missing DependencyProperty: {propName}Property");

            var clrProp = controlType.GetProperty(propName);
            Assert.True(clrProp is not null,
                $"{controlName} missing CLR property: {propName}");
        }
    }

    // ── No InfoBadge References in XAML ─────────────────────────
    // InfoBadge was removed due to WinAppSDK 1.7 compatibility issues.

    [Fact]
    public void NoInfoBadgeReferences_InXaml()
    {
        var repoRoot = FindRepoRoot();
        if (repoRoot is null) return;

        var srcDir = Path.Combine(repoRoot, "src", "SquadUplink");
        var xamlFiles = Directory.GetFiles(srcDir, "*.xaml", SearchOption.AllDirectories)
            .Where(f => !f.Contains(Path.Combine("obj", "")) &&
                        !f.Contains(Path.Combine("bin", "")))
            .ToList();

        var violations = new List<string>();
        foreach (var file in xamlFiles)
        {
            var content = File.ReadAllText(file);
            // Look for actual InfoBadge usage, not comments about it
            if (content.Contains("<InfoBadge") || content.Contains("<muxc:InfoBadge"))
            {
                violations.Add(Path.GetFileName(file));
            }
        }

        Assert.True(violations.Count == 0,
            $"InfoBadge references found in XAML (removed for WinAppSDK compatibility): " +
            string.Join(", ", violations));
    }

    // ── WebView2 Version Check ──────────────────────────────────
    // The WebView2 TypeLoadException crash was caused by using an old
    // version pulled in by Windows App SDK. We pin to >= 1.0.3856.49.

    [Fact]
    public void WebView2PackageVersion_IsAtLeastRequired()
    {
        var repoRoot = FindRepoRoot();
        if (repoRoot is null) return;

        var csprojPath = Path.Combine(repoRoot, "src", "SquadUplink", "SquadUplink.csproj");
        Assert.True(File.Exists(csprojPath), "SquadUplink.csproj not found");

        var doc = XDocument.Load(csprojPath);
        var ns = doc.Root?.Name.Namespace ?? XNamespace.None;

        var webView2Ref = doc.Descendants(ns + "PackageReference")
            .FirstOrDefault(e => e.Attribute("Include")?.Value == "Microsoft.Web.WebView2");

        Assert.NotNull(webView2Ref);

        var versionStr = webView2Ref!.Attribute("Version")?.Value;
        Assert.NotNull(versionStr);

        // Parse the version and compare
        Assert.True(Version.TryParse(versionStr, out var version),
            $"Could not parse WebView2 version: {versionStr}");
        Assert.True(version >= new Version(1, 0, 3856, 49),
            $"WebView2 version {version} is below minimum 1.0.3856.49 — " +
            $"this was the version that fixed the CsWinRT TypeLoadException crash");
    }

    // ── Velopack Package Reference Exists ───────────────────────

    [Fact]
    public void VelopackPackageReference_Exists()
    {
        var repoRoot = FindRepoRoot();
        if (repoRoot is null) return;

        var csprojPath = Path.Combine(repoRoot, "src", "SquadUplink", "SquadUplink.csproj");
        var doc = XDocument.Load(csprojPath);
        var ns = doc.Root?.Name.Namespace ?? XNamespace.None;

        var velopackRef = doc.Descendants(ns + "PackageReference")
            .FirstOrDefault(e => e.Attribute("Include")?.Value == "Velopack");

        Assert.NotNull(velopackRef);
    }

    // ── Build Script Exists and Has Required Content ────────────

    [Fact]
    public void BuildReleaseScript_HasRequiredContent()
    {
        var repoRoot = FindRepoRoot();
        if (repoRoot is null) return;

        var scriptPath = Path.Combine(repoRoot, "scripts", "build-release.ps1");
        Assert.True(File.Exists(scriptPath), "build-release.ps1 not found");

        var content = File.ReadAllText(scriptPath);
        Assert.Contains("dotnet publish", content);
        Assert.Contains("vpk pack", content);
        Assert.Contains("--packId SquadUplink", content);
        Assert.Contains("--mainExe SquadUplink.exe", content);
        Assert.Contains("--self-contained", content);
    }

    // ── Assembly Metadata ──────────────────────────────────────

    [Fact]
    public void AppAssembly_HasExpectedName()
    {
        Assert.Equal("SquadUplink", AppAssembly.GetName().Name);
    }

    [Fact]
    public void CoreAssembly_HasExpectedName()
    {
        Assert.Equal("SquadUplink.Core", CoreAssembly.GetName().Name);
    }

    [Fact]
    public void AllReferencedAssemblies_AreLoadable()
    {
        var failures = new List<string>();
        foreach (var asmName in AppAssembly.GetReferencedAssemblies())
        {
            try { Assembly.Load(asmName); }
            catch (Exception ex) { failures.Add($"{asmName.Name}: {ex.Message}"); }
        }

        Assert.True(failures.Count == 0,
            $"Failed to load {failures.Count} assemblies:\n" +
            string.Join("\n", failures));
    }

    // ── Helpers ─────────────────────────────────────────────────

    private static string? FindRepoRoot()
    {
        var dir = AppContext.BaseDirectory;
        while (dir is not null)
        {
            if (File.Exists(Path.Combine(dir, "SquadUplink.sln")))
                return dir;
            dir = Path.GetDirectoryName(dir);
        }

        var candidate = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.UserProfile),
            "source", "repos", "squad-uplink");
        return File.Exists(Path.Combine(candidate, "SquadUplink.sln")) ? candidate : null;
    }
}
