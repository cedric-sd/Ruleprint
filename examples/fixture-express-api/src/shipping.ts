export const FREE_SHIPPING_THRESHOLD = 300;
export const SOUTHEAST_ZIP_PREFIXES = ['0', '1', '2', '3'];

export interface Address {
  zip: string;
}

export function isSoutheast(address: Address): boolean {
  return SOUTHEAST_ZIP_PREFIXES.includes(address.zip[0] ?? '');
}

export function calcFreight(subtotal: number, address: Address): number {
  if (subtotal >= FREE_SHIPPING_THRESHOLD && isSoutheast(address)) {
    return 0;
  }
  return isSoutheast(address) ? 19.9 : 34.9;
}
