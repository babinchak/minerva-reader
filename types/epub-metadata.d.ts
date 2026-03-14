declare module "epub-metadata" {
  function epubMetadata(epubPath: string): Promise<{
    title?: string;
    creator?: { text?: string; "file-as"?: string } | string | Array<{ text?: string; "file-as"?: string } | string>;
    [key: string]: unknown;
  } | null>;
  export default epubMetadata;
}
