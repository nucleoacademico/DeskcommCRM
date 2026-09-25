import { describe, expect, it } from "vitest";

import { resolveInboundMediaMime, UnknownMediaMimeError } from "@/lib/messaging/media/resolve-mime";

const bytes = (...values: number[]) => Buffer.from(values);

describe("resolução robusta do MIME de mídia recebida", () => {
  it("preserva MIME específico e normaliza parâmetros", () => {
    expect(resolveInboundMediaMime({ providerMime: "audio/ogg; codecs=opus", metadataMime: null, buffer: Buffer.alloc(0) })).toBe("audio/ogg");
  });

  it.each([
    ["JPEG", bytes(0xff, 0xd8, 0xff, 0xe0), "image", "image/jpeg"],
    ["PNG", bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a), "image", "image/png"],
    ["WebP/sticker", Buffer.from("RIFF0000WEBP", "ascii"), "sticker", "image/webp"],
    ["OGG/Opus", Buffer.from("OggS0000", "ascii"), "audio", "audio/ogg"],
    ["MP3 ID3", Buffer.from("ID30000", "ascii"), "audio", "audio/mpeg"],
    ["M4A", Buffer.concat([Buffer.alloc(4), Buffer.from("ftypM4A ", "ascii")]), "audio", "audio/mp4"],
  ])("detecta %s por magic bytes quando o provider manda octet-stream", (_name, buffer, kind, expected) => {
    expect(resolveInboundMediaMime({ providerMime: "application/octet-stream", buffer, kind })).toBe(expected);
  });

  it("usa metadata específica antes de magic bytes", () => {
    expect(resolveInboundMediaMime({ providerMime: "application/octet-stream", metadataMime: "image/jpeg", buffer: Buffer.from("sem assinatura") })).toBe("image/jpeg");
  });

  it("usa extensão/URL apenas quando sinais anteriores não resolvem", () => {
    expect(resolveInboundMediaMime({ providerMime: "application/octet-stream", buffer: Buffer.from("x"), sourceUrl: "https://cdn.invalid/media/file.png?token=x", kind: "image" })).toBe("image/png");
  });

  it("falha fechado para arquivo inválido sem sinal confiável", () => {
    expect(() => resolveInboundMediaMime({ providerMime: "application/octet-stream", metadataMime: null, buffer: Buffer.from("não é mídia"), sourceUrl: "https://cdn.invalid/blob", kind: "document" })).toThrow(UnknownMediaMimeError);
  });
});
