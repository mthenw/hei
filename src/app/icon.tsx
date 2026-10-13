import { ImageResponse } from "next/og";
import { HeiMark } from "./hei-mark";

export const contentType = "image/png";

/** The browser tab icon and the home-screen icons the manifest lists: /icon/32, /icon/192, /icon/512, /icon/maskable. */
export function generateImageMetadata() {
  return [
    { id: "32", size: { width: 32, height: 32 }, contentType },
    { id: "192", size: { width: 192, height: 192 }, contentType },
    { id: "512", size: { width: 512, height: 512 }, contentType },
    { id: "maskable", size: { width: 512, height: 512 }, contentType },
  ];
}

export default async function Icon({ id }: { id: Promise<string> }) {
  const which = await id;
  const size = which === "maskable" ? 512 : Number(which);
  return new ImageResponse(
    <HeiMark size={size} bleed={which === "maskable"} />,
    { width: size, height: size },
  );
}
