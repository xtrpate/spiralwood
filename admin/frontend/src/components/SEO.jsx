import { useEffect } from "react";
import { useLocation } from "react-router-dom";

const SITE_URL = "https://spiralwoodservice.onrender.com";
const SITE_NAME = "Spiral Wood Services";

const SEO_CONFIG = {
  "/": {
    title: "Spiral Wood Services | Custom Furniture & Wood Solutions",
    description:
      "Spiral Wood Services offers custom furniture, modular kitchen cabinets, closets, and made-to-fit wood solutions through its online catalog and custom design service.",
  },

  "/catalog": {
    title: "Furniture Catalog | Spiral Wood Services",
    description:
      "Browse furniture and wood products from Spiral Wood Services, including kitchen cabinets, closets, bathroom cabinets, office furniture, and other furniture solutions.",
  },

  "/customize": {
    title: "Custom Furniture Design & Blueprint | Spiral Wood Services",
    description:
      "Create a custom furniture request with Spiral Wood Services. Explore furniture designs, provide measurements, and submit your preferred configuration for review.",
  },

  "/about": {
    title: "About Spiral Wood Services",
    description:
      "Learn about Spiral Wood Services and its furniture, cabinetry, custom design, and woodworking services.",
  },

  "/contact": {
    title: "Contact Spiral Wood Services",
    description:
      "Contact Spiral Wood Services for furniture inquiries, custom designs, orders, appointments, and other service-related concerns.",
  },

  "/faq": {
    title: "Frequently Asked Questions | Spiral Wood Services",
    description:
      "Find answers to common questions about Spiral Wood Services, furniture products, custom designs, orders, payments, delivery, and services.",
  },

  "/terms": {
    title: "Terms of Service | Spiral Wood Services",
    description:
      "Read the Terms of Service governing the use of the Spiral Wood Services website and WISDOM customer features.",
  },

  "/privacy": {
    title: "Privacy Policy | Spiral Wood Services",
    description:
      "Read the Privacy Policy explaining how Spiral Wood Services collects, uses, protects, and manages personal information through WISDOM.",
  },
};

const DEFAULT_SEO = {
  title: `${SITE_NAME} | Custom Furniture & Wood Solutions`,
  description:
    "Explore furniture, custom designs, modular cabinets, closets, and wood solutions from Spiral Wood Services.",
};

function upsertMeta(attribute, key, content) {
  let element = document.head.querySelector(
    `meta[${attribute}="${CSS.escape(key)}"]`,
  );

  if (!element) {
    element = document.createElement("meta");
    element.setAttribute(attribute, key);
    document.head.appendChild(element);
  }

  element.setAttribute("content", content);
  return element;
}

function upsertLink(rel, href) {
  let element = document.head.querySelector(`link[rel="${rel}"]`);

  if (!element) {
    element = document.createElement("link");
    element.setAttribute("rel", rel);
    document.head.appendChild(element);
  }

  element.setAttribute("href", href);
  return element;
}

function removeMeta(attribute, key) {
  const element = document.head.querySelector(
    `meta[${attribute}="${CSS.escape(key)}"]`,
  );

  element?.remove();
}

function upsertStructuredData(id, data) {
  let element = document.head.querySelector(`script[data-seo-schema="${id}"]`);

  if (!element) {
    element = document.createElement("script");
    element.type = "application/ld+json";
    element.setAttribute("data-seo-schema", id);
    document.head.appendChild(element);
  }

  element.textContent = JSON.stringify(data);
}

export default function SEO() {
  const location = useLocation();

  useEffect(() => {
    const pathname = location.pathname.replace(/\/+$/, "") || "/";
    const config = SEO_CONFIG[pathname] || DEFAULT_SEO;

    const canonicalUrl = `${SITE_URL}${pathname === "/" ? "/" : pathname}`;

    document.title = config.title;

    upsertMeta("name", "description", config.description);
    upsertMeta("name", "robots", "index, follow");

    upsertMeta("property", "og:type", "website");
    upsertMeta("property", "og:site_name", SITE_NAME);
    upsertMeta("property", "og:title", config.title);
    upsertMeta("property", "og:description", config.description);
    upsertMeta("property", "og:url", canonicalUrl);
    upsertMeta("property", "og:image", `${SITE_URL}/wisdom-icon-192-v2.png`);

    upsertLink("canonical", canonicalUrl);

    if (pathname === "/") {
      upsertStructuredData("website", {
        "@context": "https://schema.org",
        "@type": "WebSite",
        name: SITE_NAME,
        alternateName: "Spiral Wood",
        url: SITE_URL,
      });

      upsertStructuredData("organization", {
        "@context": "https://schema.org",
        "@type": "Organization",
        name: SITE_NAME,
        url: SITE_URL,
        logo: `${SITE_URL}/wisdom-icon-192-v2.png`,
        telephone: "+639530695310",
        email: "spiralwoodservices@gmail.com",
        address: {
          "@type": "PostalAddress",
          streetAddress: "8 Sitio Laot, Prenza 1",
          addressLocality: "Marilao",
          addressRegion: "Bulacan",
          addressCountry: "PH",
        },
      });
    }
  }, [location.pathname]);

  return null;
}
