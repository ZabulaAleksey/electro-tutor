import { publicPath } from "./public-mvp-contract.mjs";

const learningPages = [
  "interactive", "interactive/beam", "interactive/circuit-editor", "interactive/circular-diagram", "interactive/fourier", "interactive/reactive-two-port",
  "interactive/star-neutral", "interactive/transmission-line", "interactive/transmission-line-reference",
  "interactive/experiments/[family]/[slug]", "board", "engineering-board", "micro-labs",
  "showcase", "solutions", "tools",
];

export const restrictedEducationPaths = [
  ...["ru", "uk"].flatMap(language =>
    ["account", "classroom", "lesson", "my-services", "services"].map(section => `/${language}/${section}`)),
  "/api", "/auth", "/checkout", "/payments",
];

export function educationEdgeRoutes(base = "/") {
  return {
    version: 1,
    include: restrictedEducationPaths.flatMap(route => {
      const path = publicPath(route, base);
      return [path, `${path}/*`];
    }),
    exclude: [],
  };
}

export const educationRoutesIntegration = {
  name: "electrotutor-education-routes",
  hooks: {
    "astro:config:setup": ({ injectRoute }) => {
      const entries = [
        ["/", "index"],
        ["/[lang]", "[lang]/index"],
        ...learningPages.map(page => [`/[lang]/${page}`, `[lang]/${page}`]),
        ["/[lang]/topics", "[lang]/topics/index"],
        ["/[lang]/topics/[section]/[slug]", "[lang]/topics/[section]/[slug]"],
        ...["examples", "lab"].map(page => {
          const path = `ru/topics/dc/mesh-current-method/${page}`;
          return [`/${path}`, `${path}/index`];
        }),
      ];
      for (const [pattern, source] of entries) {
        injectRoute({ pattern, entrypoint: new URL(`../src/pages/${source}.astro`, import.meta.url), prerender: true });
      }
    },
  },
};
