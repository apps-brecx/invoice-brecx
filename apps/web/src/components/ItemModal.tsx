import { useEffect, useRef, useState, type DragEvent, type FormEvent } from "react";
import { api, apiUrl } from "../lib/api";
import { fileToBase64 } from "../lib/files";
import { mapItem, type Item } from "../lib/store";
import { useToast } from "./Toast";

const UNITS = ["pcs", "box", "kg", "g", "lb", "dozen", "hour", "case", "pack"];

const IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"];
const IMAGE_MAX_BYTES = 5 * 1024 * 1024;

/** Zoho-parity New/Edit Item modal — Name, Goods/Service, Unit, Selling
 *  Price, Description + image. Pass `initial` to edit instead of create.
 *  A new image pick is uploaded right after Save (create mode has no id
 *  until then); a queued removal is likewise applied on Save. */
export function NewItemModal({
  initialName = "",
  initial,
  onClose,
  onCreated,
}: {
  initialName?: string;
  initial?: Item;
  onClose: () => void;
  onCreated: (item: Item) => void | Promise<void>;
}) {
  const { toast } = useToast();
  const [name, setName] = useState(initial?.name ?? initialName);
  const [type, setType] = useState<"Goods" | "Service">(
    initial?.type === "Service" ? "Service" : "Goods",
  );
  const [unit, setUnit] = useState(initial?.unit ?? "");
  const [price, setPrice] = useState(initial ? String(initial.sellingPrice) : "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [saving, setSaving] = useState(false);

  // Image
  const fileRef = useRef<HTMLInputElement>(null);
  const [imgFile, setImgFile] = useState<File | null>(null);
  const [imgPreview, setImgPreview] = useState<string | null>(null);
  const [removeImg, setRemoveImg] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [imgBroken, setImgBroken] = useState(false);
  const existingImgUrl =
    initial?.imageKey && !removeImg && !imgFile
      ? apiUrl(`/items/${initial.id}/image?k=${initial.imageKey}`)
      : null;
  const preview = imgPreview ?? existingImgUrl;

  useEffect(() => () => {
    if (imgPreview) URL.revokeObjectURL(imgPreview);
  }, [imgPreview]);

  function pickImage(file: File | undefined | null) {
    if (!file) return;
    if (!IMAGE_TYPES.includes(file.type)) {
      toast("Use a PNG, JPG, WEBP or GIF image", "error");
      return;
    }
    if (file.size > IMAGE_MAX_BYTES) {
      toast("Image is larger than 5 MB", "error");
      return;
    }
    if (imgPreview) URL.revokeObjectURL(imgPreview);
    setImgFile(file);
    setImgPreview(URL.createObjectURL(file));
    setRemoveImg(false);
    setImgBroken(false);
  }

  function clearImage() {
    if (imgPreview) URL.revokeObjectURL(imgPreview);
    setImgFile(null);
    setImgPreview(null);
    setRemoveImg(true);
    if (fileRef.current) fileRef.current.value = "";
  }

  function onDrop(e: DragEvent) {
    e.preventDefault();
    setDragOver(false);
    pickImage(e.dataTransfer.files?.[0]);
  }

  async function syncImage(itemId: number | string) {
    if (imgFile) {
      const data = await fileToBase64(imgFile);
      await api.post(`/items/${itemId}/image`, { mime: imgFile.type, data });
    } else if (removeImg && initial?.imageKey) {
      await api.del(`/items/${itemId}/image`);
    }
  }

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);
    try {
      const body = {
        name: name.trim(),
        type,
        unit: unit.trim() || null,
        sellingPrice: Number(price),
        description: description.trim() || null,
      };
      /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
      const { item } = initial
        ? await api.put<{ item: any }>(`/items/${initial.id}`, body)
        : await api.post<{ item: any }>("/items", body);
      await syncImage(item.id);
      toast(initial ? `Item "${item.name}" saved` : `Item "${item.name}" added to the catalog`);
      await onCreated(mapItem(item));
    } catch (err) {
      toast(err instanceof Error ? err.message : "Failed to save item", "error");
      setSaving(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <form className="modal modal-lg" onClick={(e) => e.stopPropagation()} onSubmit={submit}>
        <button type="button" className="modal-close" aria-label="Close" onClick={onClose}>
          ✕
        </button>
        <h3>{initial ? "Edit Item" : "New Item"}</h3>

        <div className="modal-body">
        <div className="z-row">
          <label className="req">Name *</label>
          <div className="z-field">
            <input required autoFocus value={name} onChange={(e) => setName(e.target.value)} />
          </div>
        </div>

        <div className="z-row">
          <label>Type</label>
          <div className="z-field">
            <div className="radio-row">
              <label className="check">
                <input
                  type="radio"
                  name="itype"
                  checked={type === "Goods"}
                  onChange={() => setType("Goods")}
                />
                Goods
              </label>
              <label className="check">
                <input
                  type="radio"
                  name="itype"
                  checked={type === "Service"}
                  onChange={() => setType("Service")}
                />
                Service
              </label>
            </div>
          </div>
        </div>

        <div className="z-row">
          <label>Unit</label>
          <div className="z-field">
            <input
              list="item-units"
              placeholder="Select or type to add"
              value={unit}
              onChange={(e) => setUnit(e.target.value)}
            />
            <datalist id="item-units">
              {UNITS.map((u) => (
                <option key={u} value={u} />
              ))}
            </datalist>
          </div>
        </div>

        <div className="z-row">
          <label>Image</label>
          <div className="z-field">
            <div
              className={
                "item-img-drop modal-img-drop" +
                (dragOver ? " drag" : "") +
                (preview ? " has-img" : "")
              }
              role="button"
              tabIndex={0}
              onClick={() => fileRef.current?.click()}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  fileRef.current?.click();
                }
              }}
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(true);
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={onDrop}
            >
              {preview ? (
                <>
                  {imgBroken && !imgFile ? (
                    <div className="img-missing">
                      Image file isn't available in this environment
                    </div>
                  ) : (
                    <img
                      className="img-preview"
                      src={preview}
                      alt="Item"
                      onError={() => setImgBroken(true)}
                      onLoad={() => setImgBroken(false)}
                    />
                  )}
                  <div className="img-actions">
                    <button
                      type="button"
                      className="btn btn-ghost"
                      onClick={(e) => {
                        e.stopPropagation();
                        fileRef.current?.click();
                      }}
                    >
                      Replace
                    </button>
                    <button
                      type="button"
                      className="btn btn-danger"
                      onClick={(e) => {
                        e.stopPropagation();
                        clearImage();
                      }}
                    >
                      Remove
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <svg className="img-ic" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="3" width="18" height="18" rx="2.5" />
                    <circle cx="9" cy="9" r="2" />
                    <path d="m21 15-3.8-3.8a2 2 0 0 0-2.8 0L6 19.5" />
                  </svg>
                  <span>
                    Drag an image here or <b>Browse</b>
                  </span>
                  <small>PNG, JPG, WEBP or GIF — up to 5 MB</small>
                </>
              )}
              <input
                ref={fileRef}
                type="file"
                accept={IMAGE_TYPES.join(",")}
                style={{ display: "none" }}
                onChange={(e) => pickImage(e.target.files?.[0])}
              />
            </div>
          </div>
        </div>

        <div className="f-lab" style={{ margin: "14px 0 10px" }}>
          Sales information
        </div>

        <div className="z-row">
          <label className="req">Selling price *</label>
          <div className="z-field">
            <div className="z-inline">
              <span className="cur-tag">USD</span>
              <input
                required
                type="number"
                min={0}
                step="0.01"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
              />
            </div>
          </div>
        </div>

        <div className="z-row">
          <label>Description</label>
          <div className="z-field">
            <textarea rows={3} value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
        </div>
        </div>

        <div className="modal-actions">
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </form>
    </div>
  );
}
