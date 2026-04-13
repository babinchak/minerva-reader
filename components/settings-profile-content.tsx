"use client";

import { useState, useCallback, useRef } from "react";
import Cropper, { type Area } from "react-easy-crop";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { useRouter } from "next/navigation";

const AVATAR_SIZE = 256;

function emailToColor(email: string) {
  let hash = 0;
  for (let i = 0; i < email.length; i++) {
    hash = email.charCodeAt(i) + ((hash << 5) - hash);
  }
  const hue = ((hash >> 0) & 0xff) * 1.41;
  return `hsl(${hue}, 55%, 45%)`;
}

async function cropImage(imageSrc: string, cropArea: Area): Promise<Blob> {
  const image = new Image();
  image.crossOrigin = "anonymous";
  await new Promise<void>((resolve, reject) => {
    image.onload = () => resolve();
    image.onerror = reject;
    image.src = imageSrc;
  });

  const canvas = document.createElement("canvas");
  canvas.width = AVATAR_SIZE;
  canvas.height = AVATAR_SIZE;
  const ctx = canvas.getContext("2d")!;

  ctx.drawImage(
    image,
    cropArea.x,
    cropArea.y,
    cropArea.width,
    cropArea.height,
    0,
    0,
    AVATAR_SIZE,
    AVATAR_SIZE,
  );

  return new Promise((resolve) =>
    canvas.toBlob((blob) => resolve(blob!), "image/webp", 0.85),
  );
}

export function ProfileContent({
  initialDisplayName,
  initialAvatarUrl,
  email,
}: {
  initialDisplayName: string;
  initialAvatarUrl: string;
  email: string;
}) {
  const [displayName, setDisplayName] = useState(initialDisplayName);
  const [avatarUrl, setAvatarUrl] = useState(initialAvatarUrl);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const router = useRouter();

  // Crop state
  const [cropImage64, setCropImage64] = useState<string | null>(null);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedArea, setCroppedArea] = useState<Area | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const onCropComplete = useCallback((_: Area, croppedAreaPixels: Area) => {
    setCroppedArea(croppedAreaPixels);
  }, []);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      setCropImage64(reader.result as string);
      setCrop({ x: 0, y: 0 });
      setZoom(1);
    };
    reader.readAsDataURL(file);
    // Reset so re-selecting the same file triggers onChange
    e.target.value = "";
  };

  const handleCropSave = async () => {
    if (!cropImage64 || !croppedArea) return;

    setUploading(true);
    setMessage("");

    try {
      const blob = await cropImage(cropImage64, croppedArea);
      const formData = new FormData();
      formData.append("file", blob, "avatar.webp");

      const res = await fetch("/api/profile/avatar", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();
      if (!res.ok) {
        setMessage(data.error || "Upload failed");
      } else {
        setAvatarUrl(data.avatarUrl);
        setMessage("Avatar updated.");
        router.refresh();
      }
    } catch {
      setMessage("Upload failed");
    } finally {
      setUploading(false);
      setCropImage64(null);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setMessage("");

    const supabase = createClient();
    const { error } = await supabase.auth.updateUser({
      data: { full_name: displayName },
    });

    if (error) {
      setMessage(error.message);
    } else {
      setMessage("Profile updated.");
      router.refresh();
    }
    setSaving(false);
  };

  return (
    <div className="space-y-6 max-w-md">
      {/* Display name */}
      <div className="space-y-2">
        <Label htmlFor="display-name">Display name</Label>
        <Input
          id="display-name"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          placeholder={email.split("@")[0]}
        />
      </div>

      {/* Avatar */}
      <div className="space-y-3">
        <Label>Avatar</Label>
        <div className="flex items-center gap-4">
          {avatarUrl ? (
            <img
              src={avatarUrl}
              alt=""
              className="size-16 rounded-full object-cover"
              referrerPolicy="no-referrer"
            />
          ) : (
            <div
              className="flex size-16 items-center justify-center rounded-full text-xl font-medium"
              style={{ backgroundColor: emailToColor(email), color: "#fff" }}
            >
              {email[0].toUpperCase()}
            </div>
          )}
          <div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => fileRef.current?.click()}
            >
              Upload photo
            </Button>
            <p className="text-xs text-muted-foreground mt-1">
              JPG, PNG, or WebP. Max 2MB.
            </p>
          </div>
          <input
            ref={fileRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={handleFileSelect}
          />
        </div>
      </div>

      <div className="flex items-center gap-3">
        <Button onClick={handleSave} disabled={saving} size="sm">
          {saving ? "Saving..." : "Save"}
        </Button>
        {message && (
          <p className="text-sm text-muted-foreground">{message}</p>
        )}
      </div>

      {/* Crop dialog */}
      <Dialog open={!!cropImage64} onOpenChange={(open) => !open && setCropImage64(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Crop avatar</DialogTitle>
          </DialogHeader>
          <div className="relative h-72 w-full">
            {cropImage64 && (
              <Cropper
                image={cropImage64}
                crop={crop}
                zoom={zoom}
                aspect={1}
                cropShape="round"
                showGrid={false}
                onCropChange={setCrop}
                onZoomChange={setZoom}
                onCropComplete={onCropComplete}
              />
            )}
          </div>
          <input
            type="range"
            min={1}
            max={3}
            step={0.05}
            value={zoom}
            onChange={(e) => setZoom(Number(e.target.value))}
            className="w-full"
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setCropImage64(null)}>
              Cancel
            </Button>
            <Button onClick={handleCropSave} disabled={uploading}>
              {uploading ? "Uploading..." : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
