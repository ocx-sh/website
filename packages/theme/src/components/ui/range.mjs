// Number formatting shared by Meter and Slider (C-266, C-270): one formatter per options set, at a
// fixed locale so the server render and the client agree (a page has no locale prop yet).
// ponytail: locale 'en' only; add a `locale` prop when a consumer page is not English.

/** @type {Map<string, Intl.NumberFormat>} */
const formatters = new Map();

/** @param {Intl.NumberFormatOptions} [options] */
function formatter(options) {
  const key = JSON.stringify(options ?? {});
  let f = formatters.get(key);
  if (!f) formatters.set(key, (f = new Intl.NumberFormat('en', options)));
  return f;
}

/** @param {number} value @param {Intl.NumberFormatOptions} [options] */
export const formatValue = (value, options) => formatter(options).format(value);

/** A range reads "a – b"; one value reads alone. @param {number[]} values @param {Intl.NumberFormatOptions} [options] */
export const formatValues = (values, options) => values.map((v) => formatValue(v, options)).join(' – ');
