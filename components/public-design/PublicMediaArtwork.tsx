"use client";

import Image from "next/image";
import { useState } from "react";
import { ImageOff } from "lucide-react";
import s from "./PublicDesign.module.css";

/** Existing editorial assets are illustrations, never source media or a player. */
export default function PublicMediaArtwork({ src }: { src: string }) {
  const [failed, setFailed] = useState(false);
  return (
    <figure className={s.mediaArtwork}>
      {failed ? (
        <div className={s.mediaArtworkMissing}>
          <ImageOff size={28} aria-hidden />
          <span>تصویرسازی در دسترس نیست</span>
        </div>
      ) : (
        <Image
          src={src}
          alt=""
          width={1400}
          height={788}
          unoptimized
          onError={() => setFailed(true)}
        />
      )}
      <figcaption>تصویرسازی تحریریه · تصویر اصلی منبع نیست</figcaption>
    </figure>
  );
}
