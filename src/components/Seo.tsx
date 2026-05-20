import { Helmet } from "react-helmet-async";

const SITE = "https://money-notes-app.lovable.app";

interface SeoProps {
  title: string;
  description: string;
  path: string; // e.g. "/dashboard"
  ogType?: "website" | "article";
  noindex?: boolean;
}

/**
 * Per-route SEO tags: title, description, canonical, and og:*.
 * Title is capped at 60 chars and description at 160 to keep
 * SERP snippets intact.
 */
export function Seo({
  title,
  description,
  path,
  ogType = "website",
  noindex = false,
}: SeoProps) {
  const url = `${SITE}${path}`;
  const safeTitle = title.length > 60 ? title.slice(0, 57) + "…" : title;
  const safeDesc =
    description.length > 160 ? description.slice(0, 157) + "…" : description;

  return (
    <Helmet>
      <title>{safeTitle}</title>
      <meta name="description" content={safeDesc} />
      <link rel="canonical" href={url} />
      <meta property="og:title" content={safeTitle} />
      <meta property="og:description" content={safeDesc} />
      <meta property="og:url" content={url} />
      <meta property="og:type" content={ogType} />
      <meta name="twitter:title" content={safeTitle} />
      <meta name="twitter:description" content={safeDesc} />
      {noindex && <meta name="robots" content="noindex,nofollow" />}
    </Helmet>
  );
}
