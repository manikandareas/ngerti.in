import { scopeKey } from "@/lib/client-scope";

type OrganizationIdentity = { server: string; user: string; organization: string };
const logoKey = (identity: OrganizationIdentity) => `${scopeKey(identity)}organization-logo`;

export function organizationLogo(identity: OrganizationIdentity) {
  try {
    return localStorage.getItem(logoKey(identity)) ?? "";
  } catch {
    return "";
  }
}

export function saveOrganizationLogo(identity: OrganizationIdentity, logo: string) {
  localStorage.setItem(logoKey(identity), logo);
}

export async function readOrganizationLogo(file: File) {
  if (!["image/png", "image/jpeg", "image/webp"].includes(file.type))
    throw new Error("Choose a PNG, JPG or WebP image.");
  if (file.size > 2 * 1024 * 1024) throw new Error("Choose an image smaller than 2 MB.");
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    const scale = Math.min(1, 256 / Math.max(image.naturalWidth, image.naturalHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Could not prepare this image. Choose another logo.");
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/png");
  } catch {
    throw new Error("Could not open this image. Choose another logo.");
  } finally {
    URL.revokeObjectURL(url);
  }
}
