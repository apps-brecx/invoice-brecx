import { useEffect, useRef, useState, type DragEvent, type FormEvent } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useBilling } from "../../lib/store";
import { api, apiUrl } from "../../lib/api";
import { useToast } from "../../components/Toast";

const UNITS = ["pcs", "box", "kg", "g", "lb", "oz", "ml", "l", "dozen", "pack", "set", "hrs", "days"];

const IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"];
const IMAGE_MAX_BYTES = 5 * 1024 * 1024;

/** File → raw base64 (without the data-URL prefix) for the upload endpoint. */
function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1] ?? "");
    reader.onerror = () => reject(new Error("Could not read the image file"));
    reader.readAsDataURL(file);
  });
}

/** Zoho-style New Item / Edit Item full-page form. */
export function ItemForm() {
  const { id } = useParams(); // present → edit mode
  const navigate = useNavigate();
  const { toast } = useToast();
  const { items, refresh } = useBilling();
  const editing = id ? items.find((i) => String(i.id) === id) : undefined;

  const [name, setName] = useState("");
  const [type, setType] = useState<"Goods" | "Service">("Goods");
  const [unit, setUnit] = useState("");
  const [price, setPrice] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);

  // Image: a new pick is held locally and uploaded after Save; a queued
  // removal is likewise applied on Save. Preview shows whichever wins.
  const fileRef = useRef<HTMLInputElement>(null);
  const [imgFile, setImgFile] = useState<File | null>(null);
  const [imgPreview, setImgPreview] = useState<string | null>(null);
  const [removeImg, setRemoveImg] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const existingImgUrl =
    editing?.imageKey && !removeImg && !imgFile
      ? apiUrl(`/items/${editing.id}/image?k=${editing.imageKey}`)
      : null;
  const preview = imgPreview ?? existingImgUrl;

  useEffect(() => {
    if (!editing) return;
    setName(editing.name);
    setType(editing.type === "Service" ? "Service" : "Goods");
    setUnit(editing.unit ?? "");
    setPrice(String(editing.sellingPrice));
    setDescription(editing.description ?? "");
  }, [editing]);

  // Object URLs leak unless revoked when replaced/unmounted.
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
  }

  function clearImage() {
    if (imgPreview) URL.revokeObjectURL(imgPreview);
    setImgFile(null);
    setImgPreview(null);
    setRemoveImg(true); // in edit mode: queue existing image removal on Save
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
    } else if (removeImg && editing?.imageKey) {
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
      if (id) {
        await api.put(`/items/${id}`, body);
        await syncImage(id);
        await refresh();
        toast(`Item "${body.name}" saved`);
        navigate(`/items/${id}`);
      } else {
        /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
        const res = await api.post<{ item: any }>("/items", body);
        await syncImage(res.item.id);
        await refresh();
        toast(`Item "${body.name}" created`);
        navigate(`/items/${res.item.id}`);
      }
    } catch (err) {
      toast(err instanceof Error ? err.message : "Failed to save item", "error");
      setSaving(false);
    }
  }

  const crumbName =
    editing && editing.name.length > 30 ? `${editing.name.slice(0, 30)}…` : editing?.name;

  return (
    <section className="view">
      <div className="page-head">
        <div>
          <div className="crumbs">
            <button
              type="button"
              className="crumb-back"
              title="Go back"
              onClick={() => navigate(-1)}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round">
                <path d="M19 12H5M12 19l-7-7 7-7" />
              </svg>
            </button>
            <button type="button" className="crumb-link" onClick={() => navigate("/items")}>
              Items
            </button>
            {editing && (
              <>
                <span className="crumb-sep">›</span>
                <button
                  type="button"
                  className="crumb-link"
                  onClick={() => navigate(`/items/${editing.id}`)}
                >
                  {crumbName}
                </button>
              </>
            )}
            <span className="crumb-sep">›</span>
            <span className="crumb-here">{id ? "Edit" : "New"}</span>
          </div>
          <h1>{id ? "Edit Item" : "New Item"}</h1>
        </div>
      </div>

      <form className="card item-form" onSubmit={submit}>
        <div className="item-form-grid">
          <div className="item-form-main">
            <div className="form-lrow">
              <span className="f-lab req">Name*</span>
              <input
                required
                autoFocus
                maxLength={300}
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <div className="form-lrow">
              <span className="f-lab">Type</span>
              <div className="radio-row">
                <label className="check">
                  <input
                    type="radio"
                    name="itemtype"
                    checked={type === "Goods"}
                    onChange={() => setType("Goods")}
                  />
                  Goods
                </label>
                <label className="check">
                  <input
                    type="radio"
                    name="itemtype"
                    checked={type === "Service"}
                    onChange={() => setType("Service")}
                  />
                  Service
                </label>
              </div>
            </div>
            <div className="form-lrow">
              <span className="f-lab">Unit</span>
              <div>
                <input
                  list="unit-options"
                  placeholder="Select or type to add"
                  maxLength={40}
                  value={unit}
                  onChange={(e) => setUnit(e.target.value)}
                />
                <datalist id="unit-options">
                  {UNITS.map((u) => (
                    <option key={u} value={u} />
                  ))}
                </datalist>
              </div>
            </div>
          </div>
          <div
            className={
              "item-img-drop" + (dragOver ? " drag" : "") + (preview ? " has-img" : "")
            }
            role="button"
            tabIndex={0}
            title={preview ? "Replace the item image" : "Add an item image"}
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
                <img className="img-preview" src={preview} alt="Item" />
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
                <svg className="img-ic" width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
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

        <h3 className="ov-h">Sales Information</h3>
        <div className="item-form-grid">
          <div className="item-form-main">
            <div className="form-lrow">
              <span className="f-lab req">Selling Price*</span>
              <div className="money-in">
                <span className="cur">USD</span>
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
          <div className="form-lrow desc-row">
            <span className="f-lab">Description</span>
            <textarea
              rows={3}
              maxLength={2000}
              placeholder={"Syrup 750 ml\nSKU: SY-5505"}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
        </div>

        <div className="form-actions">
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? "Saving…" : "Save"}
          </button>
          <button type="button" className="btn btn-ghost" onClick={() => navigate("/items")}>
            Cancel
          </button>
        </div>
      </form>
    </section>
  );
}
