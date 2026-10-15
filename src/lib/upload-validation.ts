import type { ApplicationFields } from "./verification";

export function validateArtwork(
  files: File[],
  batch = false,
): string | undefined {
  if (!files.length) return "Choose a label image to continue.";
  if (files.length > (batch ? 300 : 1))
    return batch
      ? "Please keep each batch to 300 images."
      : "Choose one image. Use Batch upload for multiple labels.";
  if (
    files.some(
      (f) => !["image/png", "image/jpeg", "image/webp"].includes(f.type),
    )
  )
    return "Choose JPG, PNG or WebP images. Convert PDF or SVG labels to PNG first.";
  if (files.some((f) => !f.size || f.size > 10 * 1024 * 1024))
    return "Every image must be between 1 byte and 10 MB.";
  if (files.reduce((total, file) => total + file.size, 0) > 250 * 1024 * 1024)
    return "Keep each batch under 250 MB so this device stays responsive.";
  if (
    new Set(files.map((file) => file.name.toLowerCase())).size !== files.length
  )
    return "Image filenames must be unique within a batch.";
  return undefined;
}

export function validateApplication(
  app: ApplicationFields,
): string | undefined {
  if (!["spirits", "wine", "beer"].includes(app.beverage))
    return "Beverage must be spirits, wine or beer.";
  if (
    ![app.brand, app.classType, app.netContents, app.producer].every((value) =>
      value.trim(),
    )
  )
    return "Complete the brand, class/type, net contents, and producer/address fields.";
  if (app.beverage === "spirits" && !app.abv.trim())
    return "Enter the alcohol content for distilled spirits.";
  if (app.imported && !app.country.trim())
    return "Enter the country of origin for an imported product.";
  return undefined;
}
