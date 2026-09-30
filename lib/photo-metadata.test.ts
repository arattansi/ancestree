import sharp from "sharp";
import { describe, expect, it } from "vitest";

import { parsePhotoMetadata, photoDate } from "@/lib/photo-metadata";

// Fixtures are made by a real encoder (sharp / libvips) carrying XMP laid
// out the way each tagging program writes it.

const TODAY = new Date(2026, 8, 30);

const LIGHTROOM = `<?xpacket begin="﻿" id="W5M0MpCehiHzreSzNTczkc9d"?>
<x:xmpmeta xmlns:x="adobe:ns:meta/" x:xmptk="Adobe XMP Core 7.0-c000 1.000000">
 <rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">
  <rdf:Description rdf:about=""
    xmlns:xmp="http://ns.adobe.com/xap/1.0/"
    xmlns:photoshop="http://ns.adobe.com/photoshop/1.0/"
    xmlns:exif="http://ns.adobe.com/exif/1.0/"
    xmlns:dc="http://purl.org/dc/elements/1.1/"
    xmlns:lr="http://ns.adobe.com/lightroom/1.0/"
    xmlns:mwg-rs="http://www.metadataworkinggroup.com/schemas/regions/"
    xmlns:stDim="http://ns.adobe.com/xap/1.0/sType/Dimensions#"
    xmlns:stArea="http://ns.adobe.com/xmp/sType/Area#"
    xmlns:Iptc4xmpExt="http://iptc.org/std/Iptc4xmpExt/2008-02-29/"
   xmp:CreateDate="2023-04-01T10:00:00"
   exif:DateTimeOriginal="2023-04-01T10:00:00"
   photoshop:DateCreated="1962">
   <mwg-rs:Regions rdf:parseType="Resource">
    <mwg-rs:AppliedToDimensions stDim:w="4000" stDim:h="3000" stDim:unit="pixel"/>
    <mwg-rs:RegionList>
     <rdf:Bag>
      <rdf:li>
       <rdf:Description mwg-rs:Name="Fatima Jaffer" mwg-rs:Type="Face">
        <mwg-rs:Area stArea:x="0.5" stArea:y="0.4" stArea:w="0.1" stArea:h="0.15" stArea:unit="normalized"/>
       </rdf:Description>
      </rdf:li>
      <rdf:li>
       <rdf:Description mwg-rs:Name="Rex" mwg-rs:Type="Pet"/>
      </rdf:li>
      <rdf:li>
       <rdf:Description mwg-rs:Type="Face"/>
      </rdf:li>
     </rdf:Bag>
    </mwg-rs:RegionList>
   </mwg-rs:Regions>
   <dc:subject>
    <rdf:Bag>
     <rdf:li>Fatima Jaffer</rdf:li>
     <rdf:li>Beach</rdf:li>
     <rdf:li>Ali Rattansi</rdf:li>
    </rdf:Bag>
   </dc:subject>
   <lr:hierarchicalSubject>
    <rdf:Bag>
     <rdf:li>People|Ali Rattansi</rdf:li>
     <rdf:li>Places|Mombasa</rdf:li>
    </rdf:Bag>
   </lr:hierarchicalSubject>
   <Iptc4xmpExt:PersonInImage>
    <rdf:Bag>
     <rdf:li>Zainab Rattansi</rdf:li>
    </rdf:Bag>
   </Iptc4xmpExt:PersonInImage>
  </rdf:Description>
 </rdf:RDF>
</x:xmpmeta>
<?xpacket end="w"?>`;

const DIGIKAM = `<x:xmpmeta xmlns:x="adobe:ns:meta/" x:xmptk="XMP Core 4.4.0-Exiv2">
 <rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">
  <rdf:Description rdf:about=""
    xmlns:digiKam="http://www.digikam.org/ns/1.0/"
    xmlns:MicrosoftPhoto="http://ns.microsoft.com/photo/1.0/"
    xmlns:dc="http://purl.org/dc/elements/1.1/"
    xmlns:MP="http://ns.microsoft.com/photo/1.2/"
    xmlns:MPRI="http://ns.microsoft.com/photo/1.2/t/RegionInfo#"
    xmlns:MPReg="http://ns.microsoft.com/photo/1.2/t/Region#"
    xmlns:mwg-rs="http://www.metadataworkinggroup.com/schemas/regions/"
    xmlns:stArea="http://ns.adobe.com/xmp/sType/Area#">
   <digiKam:TagsList>
    <rdf:Seq>
     <rdf:li>People/Hassan Rattansi</rdf:li>
     <rdf:li>People/Unknown</rdf:li>
     <rdf:li>Events/Eid</rdf:li>
    </rdf:Seq>
   </digiKam:TagsList>
   <MicrosoftPhoto:LastKeywordXMP>
    <rdf:Bag>
     <rdf:li>People/Hassan Rattansi</rdf:li>
    </rdf:Bag>
   </MicrosoftPhoto:LastKeywordXMP>
   <MP:RegionInfo rdf:parseType="Resource">
    <MPRI:Regions>
     <rdf:Bag>
      <rdf:li MPReg:PersonDisplayName="Hassan Rattansi" MPReg:Rectangle="0.1, 0.2, 0.3, 0.4"/>
     </rdf:Bag>
    </MPRI:Regions>
   </MP:RegionInfo>
   <mwg-rs:Regions rdf:parseType="Resource">
    <mwg-rs:RegionList>
     <rdf:Bag>
      <rdf:li rdf:parseType="Resource">
       <mwg-rs:Name>Hassan Rattansi</mwg-rs:Name>
       <mwg-rs:Type>Face</mwg-rs:Type>
       <mwg-rs:Area stArea:x="0.25" stArea:y="0.3" stArea:w="0.3" stArea:h="0.4" stArea:unit="normalized"/>
      </rdf:li>
      <rdf:li rdf:parseType="Resource">
       <mwg-rs:Name>Sakina &amp; co</mwg-rs:Name>
      </rdf:li>
     </rdf:Bag>
    </mwg-rs:RegionList>
   </mwg-rs:Regions>
   <dc:subject>
    <rdf:Bag>
     <rdf:li>Hassan Rattansi</rdf:li>
     <rdf:li>Eid</rdf:li>
    </rdf:Bag>
   </dc:subject>
  </rdf:Description>
 </rdf:RDF>
</x:xmpmeta>`;

/** Windows Photo Gallery: its own regions, and its keyword tree. */
const WINDOWS = `<x:xmpmeta xmlns:x="adobe:ns:meta/">
 <rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">
  <rdf:Description rdf:about="uuid:faf5bdd5-ba3d-11da-ad31-d33d75182f1b" xmlns:MP="http://ns.microsoft.com/photo/1.2/">
   <MP:RegionInfo xmlns:MPRI="http://ns.microsoft.com/photo/1.2/t/RegionInfo#" rdf:parseType="Resource">
    <MPRI:Regions>
     <rdf:Bag xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">
      <rdf:li>
       <rdf:Description xmlns:MPReg="http://ns.microsoft.com/photo/1.2/t/Region#">
        <MPReg:Rectangle>0.411458, 0.247917, 0.130208, 0.195833</MPReg:Rectangle>
        <MPReg:PersonDisplayName>Amina Rattansi</MPReg:PersonDisplayName>
       </rdf:Description>
      </rdf:li>
     </rdf:Bag>
    </MPRI:Regions>
   </MP:RegionInfo>
  </rdf:Description>
  <rdf:Description rdf:about="uuid:faf5bdd5-ba3d-11da-ad31-d33d75182f1b" xmlns:MicrosoftPhoto="http://ns.microsoft.com/photo/1.0/">
   <MicrosoftPhoto:LastKeywordXMP>
    <rdf:Bag xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">
     <rdf:li>People/Amina Rattansi</rdf:li>
    </rdf:Bag>
   </MicrosoftPhoto:LastKeywordXMP>
  </rdf:Description>
 </rdf:RDF>
</x:xmpmeta>`;

function base() {
  return sharp({
    create: { width: 16, height: 12, channels: 3, background: "#6a7" },
  });
}

async function bytes(img: ReturnType<typeof sharp>): Promise<Uint8Array> {
  return new Uint8Array(await img.toBuffer());
}

/** A JPEG segment: marker, length, data. */
function segment(marker: number, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(4 + data.length);
  out[0] = 0xff;
  out[1] = marker;
  out[2] = ((data.length + 2) >> 8) & 0xff;
  out[3] = (data.length + 2) & 0xff;
  out.set(data, 4);
  return out;
}

/** `segments` put straight after a JPEG's start marker. */
function spliceJpeg(jpeg: Uint8Array, ...segments: Uint8Array[]): Uint8Array {
  const parts = [jpeg.subarray(0, 2), ...segments, jpeg.subarray(2)];
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}

const enc = (s: string) => new TextEncoder().encode(s);
const concat = (...parts: Uint8Array[]) => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
};

function iptcDataset(record: number, dataset: number, value: Uint8Array) {
  return concat(
    new Uint8Array([0x1c, record, dataset, value.length >> 8, value.length & 0xff]),
    value,
  );
}

/** An APP13 Photoshop block holding IPTC, as Lightroom and Photo
 *  Mechanic write keywords and the date created. */
function iptcSegment(keywords: string[], dateCreated?: string) {
  const iptc = concat(
    iptcDataset(1, 90, new Uint8Array([0x1b, 0x25, 0x47])),
    ...keywords.map((k) => iptcDataset(2, 25, enc(k))),
    ...(dateCreated ? [iptcDataset(2, 55, enc(dateCreated))] : []),
  );
  const size = new Uint8Array(4);
  new DataView(size.buffer).setUint32(0, iptc.length);
  return segment(
    0xed,
    concat(
      enc("Photoshop 3.0\0"),
      enc("8BIM"),
      new Uint8Array([0x04, 0x04, 0x00, 0x00]),
      size,
      iptc,
      iptc.length % 2 ? new Uint8Array([0]) : new Uint8Array(0),
    ),
  );
}

describe("parsePhotoMetadata", () => {
  it("reads Lightroom's named faces, person shown, keywords and a scan's year", async () => {
    const jpeg = await bytes(base().jpeg().withXmp(LIGHTROOM));
    const meta = await parsePhotoMetadata(jpeg, TODAY);
    expect(meta.names).toEqual([
      { name: "Fatima Jaffer", source: "region" },
      { name: "Zainab Rattansi", source: "shown" },
      { name: "Ali Rattansi", source: "people" },
      { name: "Beach", source: "keyword" },
      { name: "Mombasa", source: "keyword" },
    ]);
    // Scanned in 2023; someone wrote in 1962. The older is the photo's.
    expect(meta.taken).toBe("1962");
  });

  it("reads digiKam's regions in both layouts and its keyword tree", async () => {
    const jpeg = await bytes(base().jpeg().withXmp(DIGIKAM));
    const meta = await parsePhotoMetadata(jpeg, TODAY);
    expect(meta.names.slice(0, 2)).toEqual([
      { name: "Hassan Rattansi", source: "region" },
      { name: "Sakina & co", source: "region" },
    ]);
    expect(meta.names).toContainEqual({ name: "Unknown", source: "people" });
    expect(meta.names).toContainEqual({ name: "Eid", source: "keyword" });
    expect(meta.taken).toBeNull();
  });

  it("reads Windows Photo Gallery's regions, Explorer's tags and the camera's date", async () => {
    const jpeg = await bytes(
      base()
        .jpeg()
        .withExif({
          IFD0: { XPKeywords: "Amina Rattansi;Wedding" },
          IFD2: { DateTimeOriginal: "2005:07:16 14:03:00" },
          IFD3: { GPSLatitudeRef: "N", GPSLongitudeRef: "E" },
        })
        .withXmp(WINDOWS),
    );
    const meta = await parsePhotoMetadata(jpeg, TODAY);
    expect(meta.names).toEqual([
      { name: "Amina Rattansi", source: "region" },
      { name: "Wedding", source: "keyword" },
    ]);
    expect(meta.taken).toBe("2005-07-16");
    // Only who and when: nothing about where.
    expect(Object.keys(meta).sort()).toEqual(["names", "taken"]);
  });

  it("reads IPTC keywords and a date created with an unknown month", async () => {
    const jpeg = await bytes(base().jpeg());
    const withIptc = spliceJpeg(
      jpeg,
      iptcSegment(["Nasim Rattansi", "Garden", "Zoë Jaffer"], "19620000"),
    );
    const meta = await parsePhotoMetadata(withIptc, TODAY);
    expect(meta.names.map((n) => n.name)).toEqual(["Nasim Rattansi", "Garden", "Zoë Jaffer"]);
    expect(meta.taken).toBe("1962");
  });

  it("puts a long XMP packet back together from its extended segments", async () => {
    const guid = "0123456789ABCDEF0123456789ABCDEF";
    const main = `<x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"><rdf:Description rdf:about="" xmlns:xmpNote="http://ns.adobe.com/xmp/note/" xmpNote:HasExtendedXMP="${guid}"/></rdf:RDF></x:xmpmeta>`;
    const extended = enc(LIGHTROOM);
    const half = Math.floor(extended.length / 2);
    const part = (offset: number, chunk: Uint8Array) => {
      const head = new Uint8Array(8);
      new DataView(head.buffer).setUint32(0, extended.length);
      new DataView(head.buffer).setUint32(4, offset);
      return segment(
        0xe1,
        concat(enc("http://ns.adobe.com/xmp/extension/\0"), enc(guid), head, chunk),
      );
    };
    const jpeg = spliceJpeg(
      await bytes(base().jpeg()),
      segment(0xe1, concat(enc("http://ns.adobe.com/xap/1.0/\0"), enc(main))),
      // Out of order, as a writer may.
      part(half, extended.subarray(half)),
      part(0, extended.subarray(0, half)),
    );
    const meta = await parsePhotoMetadata(jpeg, TODAY);
    expect(meta.names[0]).toEqual({ name: "Fatima Jaffer", source: "region" });
  });

  it("reads PNG's compressed XMP and eXIf chunks", async () => {
    const png = await bytes(
      base()
        .png()
        .withExif({ IFD2: { DateTimeOriginal: "1999:12:31 23:59:59" } })
        .withXmp(DIGIKAM),
    );
    const meta = await parsePhotoMetadata(png, TODAY);
    expect(meta.names[0]).toEqual({ name: "Hassan Rattansi", source: "region" });
    expect(meta.taken).toBe("1999-12-31");
  });

  it("reads WebP's EXIF and XMP chunks", async () => {
    const webp = await bytes(
      base()
        .webp()
        .withExif({ IFD2: { DateTimeOriginal: "2011:03:04 05:06:07" } })
        .withXmp(WINDOWS),
    );
    const meta = await parsePhotoMetadata(webp, TODAY);
    expect(meta.names[0]).toEqual({ name: "Amina Rattansi", source: "region" });
    expect(meta.taken).toBe("2011-03-04");
  });

  it("finds nothing in a photo that says nothing, and never throws", async () => {
    const plain = await bytes(base().jpeg());
    expect(await parsePhotoMetadata(plain, TODAY)).toEqual({ names: [], taken: null });
    const full = await bytes(
      base()
        .jpeg()
        .withExif({ IFD2: { DateTimeOriginal: "2005:07:16 14:03:00" } })
        .withXmp(LIGHTROOM),
    );
    for (let cut = 0; cut < full.length; cut += 37) {
      await expect(parsePhotoMetadata(full.subarray(0, cut), TODAY)).resolves.toBeDefined();
    }
    const noise = new Uint8Array(4096).map((_, i) => (i * 7919) % 251);
    noise[0] = 0xff;
    noise[1] = 0xd8;
    await expect(parsePhotoMetadata(noise, TODAY)).resolves.toBeDefined();
    await expect(parsePhotoMetadata(enc("<x:xmpmeta><<<"), TODAY)).resolves.toEqual({
      names: [],
      taken: null,
    });
  });

  it("prefers a camera's whole date to a year written in that agrees with it", async () => {
    const jpeg = await bytes(
      base()
        .jpeg()
        .withExif({ IFD2: { DateTimeOriginal: "1962:03:05 12:00:00" } })
        .withXmp(LIGHTROOM.replace(/2023-04-01T10:00:00/g, "1962-03-05T12:00:00")),
    );
    expect((await parsePhotoMetadata(jpeg, TODAY)).taken).toBe("1962-03-05");
  });
});

describe("photoDate", () => {
  it("reads each way a photo writes its date", () => {
    expect(photoDate("1987:06:05 10:11:12", TODAY)).toBe("1987-06-05");
    expect(photoDate("1987-06-05T10:11:12+01:00", TODAY)).toBe("1987-06-05");
    expect(photoDate("1987-06", TODAY)).toBe("1987-06");
    expect(photoDate("1962", TODAY)).toBe("1962");
    expect(photoDate("19620305", TODAY)).toBe("1962-03-05");
    expect(photoDate("2005:00:00 00:00:00", TODAY)).toBe("2005");
  });

  it("drops dates no photo was taken on", () => {
    expect(photoDate("0000:00:00 00:00:00", TODAY)).toBeNull();
    expect(photoDate("    :  :     :  :  ", TODAY)).toBeNull();
    expect(photoDate("1825:01:01 00:00:00", TODAY)).toBeNull();
    expect(photoDate("1987:02:30 00:00:00", TODAY)).toBeNull();
    expect(photoDate("1987:13:01 00:00:00", TODAY)).toBeNull();
    expect(photoDate("2026:10:01 09:00:00", TODAY)).toBe("2026-10-01");
    expect(photoDate("2026:10:02 09:00:00", TODAY)).toBeNull();
    expect(photoDate("", TODAY)).toBeNull();
  });
});
