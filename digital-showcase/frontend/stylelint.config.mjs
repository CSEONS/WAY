// Enforces the rules of src/styles/STYLE_GUIDE.md. Run: npm run lint:css

/** Spacing and corner radius come from --space-* / --radius-* tokens. */
const spacingProperties = "/^(margin|padding|gap|row-gap|column-gap|border-radius|inset)/";

/** @type {import("stylelint").Config} */
export default {
  rules: {
    // Colors live in tokens.css only.
    "color-no-hex": true,
    "color-named": "never",
    "function-disallowed-list": ["rgb", "rgba", "hsl", "hsla"],

    // Font sizes, stacking and spacing come from the token scales.
    "declaration-property-value-allowed-list": {
      "font-size": ["/^var\\(--font-size-/", "inherit"],
      "z-index": ["/^var\\(--z-/", "0", "1", "-1", "auto"]
    },
    "declaration-property-value-disallowed-list": {
      [spacingProperties]: ["/\\d+px/"]
    },
    "declaration-no-important": true,

    // Plain mistakes.
    "color-no-invalid-hex": true,
    "block-no-empty": true,
    "declaration-block-no-duplicate-properties": [true, { ignore: ["consecutive-duplicates-with-different-syntaxes"] }],
    "property-no-unknown": true,
    "unit-no-unknown": true,
    "function-calc-no-unspaced-operator": true,
    "selector-pseudo-class-no-unknown": [true, { ignorePseudoClasses: ["global", "local"] }],
    "selector-pseudo-element-no-unknown": true,
    "at-rule-no-unknown": true,
    "no-invalid-double-slash-comments": true,
    "keyframes-name-pattern": "^[a-z][a-z0-9-]*$"
  },
  overrides: [
    {
      // The one place raw values are allowed.
      files: ["src/styles/tokens.css"],
      rules: {
        "color-no-hex": null,
        "function-disallowed-list": null,
        "declaration-property-value-allowed-list": null,
        "declaration-property-value-disallowed-list": null
      }
    },
    {
      // Global reduced-motion reset must override every animation.
      files: ["src/styles/global.css"],
      rules: {
        "declaration-no-important": null
      }
    }
  ]
};
