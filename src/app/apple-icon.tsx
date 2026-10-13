import { ImageResponse } from "next/og";
import { HeiMark } from "./hei-mark";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

/** The iPhone home-screen icon. iOS rounds the corners itself, so the tile fills the square. */
export default function AppleIcon() {
  return new ImageResponse(<HeiMark size={180} bleed />, size);
}
