namespace SquadUplink.Models;

public enum LayoutMode
{
    Tabs,
    Grid
}

public record GridSize(int Rows, int Columns)
{
    public static GridSize Default => new(2, 2);

    public static readonly GridSize[] Presets =
    [
        new(1, 1),
        new(2, 1),
        new(1, 2),
        new(2, 2),
        new(3, 2),
        new(2, 3),
    ];

    public override string ToString() => $"{Rows}x{Columns}";

    public static GridSize Parse(string value)
    {
        var parts = value.Split('x');
        return parts.Length == 2
            && int.TryParse(parts[0], out var r)
            && int.TryParse(parts[1], out var c)
                ? new GridSize(r, c)
                : Default;
    }
}
