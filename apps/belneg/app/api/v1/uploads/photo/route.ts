import { NextRequest } from "next/server";
import { put } from "@vercel/blob";
import { requireUser, newId, ok, bad } from "../../_lib";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";       // Blob SDK requires Node runtime
export const maxDuration = 30;          // 30s upload window

// POST multipart/form-data with field "file"
export async function POST(req: NextRequest) {
  const auth = await requireUser(req);
  if (!auth.ok) return auth.res;

  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return bad("photo storage belum dikonfigurasi", 503);
  }

  const form = await req.formData().catch(() => null);
  if (!form) return bad("expected multipart/form-data");

  const file = form.get("file");
  if (!file || !(file instanceof File)) return bad("field 'file' required");

  const MAX_BYTES = 8 * 1024 * 1024; // 8 MB
  if (file.size > MAX_BYTES) return bad(`file > ${MAX_BYTES / 1024 / 1024} MB`, 413);
  const allowed = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"];
  if (!allowed.includes(file.type)) return bad(`mime ${file.type} tidak didukung`, 415);

  const ext = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
  const id = newId("pho");
  const pathname = `kkri/${auth.user.sub}/${id}.${ext}`;

  const blob = await put(pathname, file, {
    access: "public",
    contentType: file.type,
    addRandomSuffix: false,
  });

  return ok({
    url: blob.url,
    pathname: blob.pathname,
    size: file.size,
    content_type: file.type,
  });
}
