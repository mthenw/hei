import type { MetadataRoute } from "next";

/** Lets phones install Hei to the home screen and open it full-screen, straight into Chat. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Hei",
    short_name: "Hei",
    description: "Personal assistant",
    start_url: "/chat",
    display: "standalone",
    background_color: "#0c0c0c",
    theme_color: "#0c0c0c",
    icons: [
      { src: "/icon/192", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon/512", sizes: "512x512", type: "image/png", purpose: "any" },
      {
        src: "/icon/maskable",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
