// Floats as decimals (SPEC §6.5, §8).

/** The shortest decimal that reads back as a positive, finite float, as digits and exponent. */
function shortest(value: number): [digits: string, exponent: number] {
  const [mantissa = "", exponent = "0"] = String(value).split("e");
  const [whole = "", fraction = ""] = mantissa.split(".");
  const all = (whole + fraction).replace(/^0+/, "");
  const digits = all.replace(/0+$/, "");
  return [digits, Number(exponent) - fraction.length + all.length - digits.length];
}

/** A positive, finite float as the integer and power of ten of its shortest decimal. */
export function decimal(value: number): [digits: bigint, exponent: number] {
  const [digits, exponent] = shortest(value);
  return [BigInt(digits), exponent];
}

/** The shortest decimal, without exponent, that reads back as the same float. */
export function formatNumber(value: number): string {
  if (value === 0) {
    return "0";
  }
  const [digits, exponent] = shortest(Math.abs(value));
  const sign = value < 0 ? "-" : "";
  if (exponent >= 0) {
    return sign + digits + "0".repeat(exponent);
  }
  const point = digits.length + exponent;
  if (point > 0) {
    return `${sign}${digits.slice(0, point)}.${digits.slice(point)}`;
  }
  return `${sign}0.${"0".repeat(-point)}${digits}`;
}
