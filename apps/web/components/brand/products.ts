import productsJson from '@/config/products.json';

export interface ProductSite {
  id: string;
  name: string;
  /** Live website, supplied by Victor. */
  url: string;
  /** Path under public/ once a logo is supplied; null shows a monogram. */
  logo: string | null;
  /** Null until Victor describes the product; nothing is guessed. */
  description: string | null;
}

export function getProductSites(): ProductSite[] {
  return productsJson as ProductSite[];
}
