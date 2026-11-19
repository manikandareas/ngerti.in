import { createHash } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "../../../apps/server/node_modules/sharp";

const token = process.env.NGERTIIN_TEST_MEDIA_TOKEN;
const whisperModel = process.env.HERMES_WHISPER_MODEL;
if (!token) throw new Error("Set the isolated media fixture token.");

Bun.serve({
  hostname: "127.0.0.1",
  port: 8473,
  async fetch(request) {
    if (new URL(request.url).pathname !== "/media" || request.method !== "POST")
      return new Response("Not found.", { status: 404 });
    if (request.headers.get("Authorization") !== `Bearer ${token}`)
      return new Response("Unauthorized.", { status: 401 });
    const input = await request.formData();
    const operation = input.get("operation");
    const asset = input.get("asset");
    const command_id = request.headers.get("Idempotency-Key");
    const digest = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
    if (operation === "inspect_video" || operation === "generate_video") {
      const work = mkdtempSync(join(tmpdir(), "ngertiin-video-proof-"));
      const path = join(work, "clip.mp4");
      try {
        if (operation === "inspect_video") {
          if (!(asset instanceof Blob) || asset.type !== "video/mp4")
            return new Response("Expected an MP4 clip.", { status: 422 });
          const source = new Uint8Array(await asset.arrayBuffer());
          await Bun.write(path, source);
          const frames = [0.25, 1.25].map((seconds) => {
            const frame = Bun.spawnSync([
              "ffmpeg", "-v", "error", "-ss", String(seconds), "-i", path,
              "-frames:v", "1", "-vf", "scale=1:1", "-pix_fmt", "rgb24", "-f", "rawvideo", "pipe:1",
            ]);
            return frame.exitCode === 0 ? Array.from(frame.stdout) : [];
          });
          const colors = frames.map(([r, g, b]) => {
            if (b > 140 && r < 70 && g < 105) return "blue";
            if (r > 170 && g >= 65 && g <= 165 && b < 80) return "orange";
            return null;
          });
          if (colors.some((color) => color === null))
            return new Response("Could not identify both sampled frames.", { status: 422 });
          const text = colors[0] === colors[1]
            ? `The screen stays ${colors[0]} at both sample times.`
            : `The screen changes from ${colors[0]} to ${colors[1]}.`;
          console.info(JSON.stringify({ operation, command_id, sha256: digest(source), frames, colors }));
          return Response.json({ text });
        }
        const prompt = input.get("prompt");
        if (asset || typeof prompt !== "string")
          return new Response("Video description required.", { status: 422 });
        if (!/green/i.test(prompt) || !/purple/i.test(prompt))
          return new Response("Expected a green to purple slate.", { status: 422 });
        const rendered = Bun.spawnSync([
          "ffmpeg", "-v", "error", "-f", "lavfi", "-i", "color=0x249048:s=320x200:r=24:d=1.5",
          "-f", "lavfi", "-i", "color=0x864ace:s=320x200:r=24:d=1.5",
          "-filter_complex", "[0:v][1:v]concat=n=2:v=1:a=0", "-an", "-c:v", "libx264",
          "-pix_fmt", "yuv420p", "-movflags", "+faststart", path,
        ]);
        if (rendered.exitCode) return new Response("Video rendering failed.", { status: 422 });
        const complete = new Uint8Array(await Bun.file(path).arrayBuffer());
        const truncated = /broken-media fixture/i.test(prompt);
        const bytes = truncated ? complete.subarray(0, complete.length - 32) : complete;
        console.info(JSON.stringify({ operation, command_id, sha256: digest(bytes), bytes: bytes.length, truncated }));
        return new Response(bytes, { headers: { "Content-Type": "video/mp4" } });
      } finally {
        rmSync(work, { recursive: true, force: true });
      }
    }
    if (operation === "generate_image" || operation === "edit_image") {
      const prompt = input.get("prompt");
      if (typeof prompt !== "string") return new Response("Image prompt required.", { status: 422 });
      let source_sha256: string | undefined;
      let png: Buffer;
      if (operation === "generate_image") {
        if (asset || !/orange/i.test(prompt) || !/dark green/i.test(prompt))
          return new Response("Expected an orange circle on dark green.", { status: 422 });
        const scene = Buffer.from(
          '<svg xmlns="http://www.w3.org/2000/svg" width="640" height="400"><path fill="#123829" d="M0 0h640v400H0z"/><circle cx="320" cy="200" r="112" fill="#f59536"/></svg>',
        );
        png = await sharp(scene).png().toBuffer();
      } else {
        if (!(asset instanceof Blob) || asset.type !== "image/png" || !/blue/i.test(prompt))
          return new Response("Expected a PNG source and a blue circle edit.", { status: 422 });
        const source = Buffer.from(await asset.arrayBuffer());
        source_sha256 = digest(source);
        const { data, info } = await sharp(source).removeAlpha().raw().toBuffer({ resolveWithObject: true });
        let changed = 0;
        for (let offset = 0; offset < data.length; offset += 3) {
          if (data[offset] < 40 || data[offset] <= 1.3 * data[offset + 1]) continue;
          data.set([45, 104, 222], offset);
          changed++;
        }
        if (!changed) return new Response("The source image has no orange circle.", { status: 422 });
        png = await sharp(data, { raw: { width: info.width, height: info.height, channels: 3 } }).png().toBuffer();
      }
      console.info(JSON.stringify({ operation, command_id, source_sha256, sha256: digest(png), bytes: png.length }));
      return new Response(new Uint8Array(png), { headers: { "Content-Type": "image/png" } });
    }
    if (operation === "transcribe_audio" || operation === "speak") {
      const work = mkdtempSync(join(tmpdir(), "ngertiin-voice-proof-"));
      const wav = join(work, "audio.wav");
      try {
        if (operation === "transcribe_audio") {
          if (!whisperModel || !(asset instanceof Blob) || !["audio/wav", "audio/x-wav"].includes(asset.type))
            return new Response("Audio unavailable.", { status: 422 });
          const bytes = new Uint8Array(await asset.arrayBuffer());
          await Bun.write(wav, bytes);
          const result = Bun.spawnSync([
            "whisper-cli", "-m", whisperModel, "-f", wav, "-nt", "-np", "-ng", "-t", "2",
          ], { stderr: "ignore" });
          const text = result.stdout.toString().trim();
          if (result.exitCode || !text) return new Response("Audio transcription failed.", { status: 422 });
          console.info(JSON.stringify({ operation, text, sha256: digest(bytes), command_id }));
          return Response.json({ text });
        }
        const text = input.get("prompt");
        if (asset || typeof text !== "string" || !text.trim())
          return new Response("Speech text required.", { status: 422 });
        await Bun.write(join(work, "speech.txt"), text);
        const spoken = Bun.spawnSync(["say", "-v", "Samantha", "-r", "148", "-f", join(work, "speech.txt"), "-o", join(work, "speech.aiff")]);
        if (spoken.exitCode) return new Response("Speech synthesis failed.", { status: 422 });
        const format = Bun.spawnSync(["ffmpeg", "-v", "error", "-i", join(work, "speech.aiff"), "-ar", "16000", "-ac", "1", "-c:a", "pcm_s16le", wav]);
        if (format.exitCode) return new Response("Speech conversion failed.", { status: 422 });
        const bytes = await Bun.file(wav).arrayBuffer();
        console.info(JSON.stringify({ operation, text, sha256: digest(new Uint8Array(bytes)), bytes: bytes.byteLength, command_id }));
        return new Response(bytes, { headers: { "Content-Type": "audio/wav" } });
      } finally {
        rmSync(work, { recursive: true, force: true });
      }
    }
    if (operation !== "inspect_image" || !(asset instanceof Blob) || asset.type !== "image/png")
      return new Response("Invalid image input.", { status: 422 });
    const bytes = Buffer.from(await asset.arrayBuffer());
    const ocr = Bun.spawnSync(["tesseract", "stdin", "stdout", "--psm", "6"], { stdin: bytes, stderr: "ignore" });
    const value = ocr.stdout.toString().match(/[A-Z]{5}-\d{3}/)?.[0];
    if (ocr.exitCode !== 0 || !value) return new Response("Unreadable image.", { status: 422 });
    console.info(JSON.stringify({ operation, value, sha256: digest(bytes), command_id }));
    return Response.json({ text: `Inspection code ${value}.` });
  },
});
