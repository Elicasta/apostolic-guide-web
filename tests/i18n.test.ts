import assert from "node:assert/strict";
import test from "node:test";
import { getDictionary } from "../src/i18n/dictionaries";
import { isLocale, localeMeta, toContentLocale } from "../src/i18n/config";
import {
  getLocalizedBasePath,
  getLocalizedContentUrl,
  getPublicContentUrl,
} from "../src/i18n/routes";
import { getLocalizedValue } from "../src/i18n/content";

test("recognizes only supported public locales", () => {
  assert.equal(isLocale("en"), true);
  assert.equal(isLocale("es"), true);
  assert.equal(isLocale("fr"), false);
  assert.equal(isLocale("en-US"), false);
});

test("maps public locale to existing database locale safely", () => {
  assert.equal(toContentLocale("en"), "en-US");
  assert.equal(toContentLocale("es"), "es-US");
  assert.equal(localeMeta.es.brandName, "Guía Apostólica");
});

test("Spanish routes use localized segments", () => {
  assert.equal(getLocalizedBasePath("es", "pathways"), "/es/rutas");
  assert.equal(
    getLocalizedContentUrl({ locale: "es", type: "pathway", slug: "jesus-es-dios" }),
    "/es/rutas/jesus-es-dios",
  );
});

test("English compatibility URLs remain on existing production routes", () => {
  assert.equal(
    getPublicContentUrl({ locale: "en", type: "pathway", slug: "jesus-is-god" }),
    "/pathways/jesus-is-god",
  );
  assert.equal(
    getPublicContentUrl({ locale: "en", type: "answer", slug: "why-did-jesus-pray" }),
    "/answers/why-did-jesus-pray",
  );
});

test("Spanish dictionary is independently authored", () => {
  const dictionary = getDictionary("es");
  assert.equal(dictionary.nav.pathways, "Rutas Bíblicas");
  assert.equal(dictionary.scripture.whyItMatters, "Por qué importa");
});

test("editorial content does not silently fall back across locales", () => {
  const localized = { en: "Jesus Is God" };
  assert.equal(getLocalizedValue(localized, "en"), "Jesus Is God");
  assert.equal(getLocalizedValue(localized, "es"), null);
});
