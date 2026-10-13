/**
 * Hei's mark for generated icons: a coral tile with a dark "h". `bleed` fills the square edge to edge with a smaller
 * letter, for icons the platform masks into its own shape (Android maskable, iOS).
 */
export function HeiMark({
  size,
  bleed = false,
}: {
  size: number;
  bleed?: boolean;
}) {
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#ee6a55",
        borderRadius: bleed ? 0 : size * 0.22,
        color: "#1a0906",
        fontSize: size * (bleed ? 0.46 : 0.62),
        fontWeight: 700,
        lineHeight: 1,
        paddingBottom: size * 0.06,
      }}
    >
      h
    </div>
  );
}
