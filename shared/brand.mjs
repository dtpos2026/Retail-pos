// Developer / vendor branding shown in the login screen, sidebar, splash, About and receipts.
// Fill in the empty fields (phone, WhatsApp, website, Facebook, Instagram) and they appear automatically.
export const BRAND = {
  developer: 'Digital Target',
  product: 'Retail POS',
  tagline: 'Simple Offline POS for Small Businesses',
  email: 'digitaltarget.digital@gmail.com',
  phone: '',
  whatsapp: '', // digits with country code, e.g. 923001234567
  website: '',
  facebook: '',
  instagram: '',
};

export function brandLinks() {
  const links = [];
  if (BRAND.whatsapp) links.push({ key: 'whatsapp', label: 'WhatsApp', url: `https://wa.me/${BRAND.whatsapp.replace(/\D/g, '')}` });
  if (BRAND.phone) links.push({ key: 'phone', label: BRAND.phone, url: `tel:${BRAND.phone.replace(/\s/g, '')}` });
  if (BRAND.email) links.push({ key: 'email', label: 'Email', url: `mailto:${BRAND.email}` });
  if (BRAND.website) links.push({ key: 'website', label: 'Website', url: BRAND.website });
  if (BRAND.facebook) links.push({ key: 'facebook', label: 'Facebook', url: BRAND.facebook });
  if (BRAND.instagram) links.push({ key: 'instagram', label: 'Instagram', url: BRAND.instagram });
  return links;
}
