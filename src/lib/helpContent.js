// Help guide content (English + Urdu). Every topic has: where to find it, numbered steps, optional tips.
// `icon` is a lucide-react icon name (mapped in components/HelpGuide.jsx), `to` the page the "Open" button goes to.

export const TOPICS = [
  {
    id: 'start', icon: 'Rocket', group: 'basics',
    title: { en: 'Getting started (first 10 minutes)', ur: 'شروعات (پہلے 10 منٹ)' },
    where: { en: 'Login screen → Settings → Business', ur: 'لاگ اِن → سیٹنگز ← بزنس' },
    steps: {
      en: [
        'Log in with the admin PIN. First time: PIN 1234 — change it straight away in Users.',
        'Open Settings → Business and type your shop name, address, phone and logo. They print on every receipt.',
        'Open Settings → Sales & Tax and switch on Dine-In / Takeaway / Delivery as you need them, and set GST / service charge if any.',
        'Add your categories and products (Products → Add Product), or press Settings → General → Load demo data to practise first.',
        'Connect your printer: Settings → Printers → Add a printer, then print a Test receipt.',
        'Make one test sale from POS / New Sale, then check Reports → Day Summary.',
      ],
      ur: [
        'ایڈمن PIN سے لاگ اِن کریں۔ پہلی بار PIN 1234 ہے — فوراً Users میں جا کر بدل دیں۔',
        'سیٹنگز ← بزنس میں دکان کا نام، پتہ، فون اور لوگو لکھیں۔ یہ ہر رسید پر چھپتے ہیں۔',
        'سیٹنگز ← Sales & Tax میں ڈائن اِن / ٹیک اوے / ڈیلیوری اپنی ضرورت کے مطابق آن کریں اور GST یا سروس چارجز لگائیں۔',
        'کیٹیگری اور پروڈکٹس بنائیں (Products ← Add Product)، یا پہلے مشق کے لیے سیٹنگز ← General ← Load demo data دبائیں۔',
        'پرنٹر جوڑیں: سیٹنگز ← Printers ← Add a printer، پھر Test receipt چھاپ کر دیکھیں۔',
        'POS / New Sale سے ایک ٹیسٹ سیل کریں اور Reports ← Day Summary میں دیکھیں۔',
      ],
    },
    tips: {
      en: ['Demo data can be removed any time with Factory reset (Settings → General). Take a backup first if you have real data.'],
      ur: ['ڈیمو ڈیٹا کو کسی بھی وقت Factory reset (سیٹنگز ← General) سے ہٹایا جا سکتا ہے۔ اصل ڈیٹا ہو تو پہلے بیک اپ لے لیں۔'],
    },
  },
  {
    id: 'sale', icon: 'ShoppingCart', group: 'selling', to: '/pos', perm: 'pos',
    title: { en: 'Making a sale (POS)', ur: 'سیل کرنا (POS)' },
    where: { en: 'Sidebar → POS / New Sale', ur: 'سائیڈ بار ← POS / New Sale' },
    steps: {
      en: [
        'Choose the order type at the top of the bill: Takeaway, Dine-In or Delivery.',
        'Tap products to add them. Tap the same product again to add more. Use the search box (F2) or scan a barcode.',
        'Tap a line in the bill to change quantity, add a note, or give a discount on that item.',
        'Press Pay (F9), choose the payment method, type the amount received (or tap a quick-cash button) and confirm.',
        'The receipt prints automatically. Use Hold (F8) if the customer is not ready to pay yet.',
      ],
      ur: [
        'بل کے اوپر آرڈر کی قسم چنیں: ٹیک اوے، ڈائن اِن یا ڈیلیوری۔',
        'پروڈکٹ پر ٹیپ کریں تو بل میں آ جاتی ہے۔ دوبارہ ٹیپ کریں تو مقدار بڑھتی ہے۔ سرچ باکس (F2) یا بارکوڈ اسکین بھی چلتا ہے۔',
        'بل کی لائن پر ٹیپ کر کے مقدار بدلیں، نوٹ لکھیں یا اُس آئٹم پر رعایت دیں۔',
        'Pay (F9) دبائیں، ادائیگی کا طریقہ چنیں، وصول شدہ رقم لکھیں (یا کوئیک کیش بٹن دبائیں) اور تصدیق کریں۔',
        'رسید خود بخود چھپ جاتی ہے۔ اگر گاہک ابھی ادائیگی نہیں کر رہا تو Hold (F8) دبائیں۔',
      ],
    },
    tips: {
      en: ['Sold the wrong item? Open Orders, open the sale and use Refund / Cancel (needs permission).'],
      ur: ['غلط آئٹم بک گیا؟ Orders میں جا کر سیل کھولیں اور Refund / Cancel کریں (اجازت درکار ہے)۔'],
    },
  },
  {
    id: 'dinein', icon: 'Armchair', group: 'selling', to: '/tables', perm: 'tables',
    title: { en: 'Dine-in: tables, running bills, KOT', ur: 'ڈائن اِن: ٹیبل، رننگ بل، کچن ٹکٹ' },
    where: { en: 'POS → Dine-In, and Sidebar → Tables', ur: 'POS ← Dine-In اور سائیڈ بار ← Tables' },
    steps: {
      en: [
        'Settings → Sales & Tax → switch on Dine-In. Add your tables and floors in the Tables page.',
        'In POS choose Dine-In, pick a table and (optionally) the waiter, add the items and press Save (F8). The kitchen ticket (KOT) prints for the new items.',
        'The table shows as Running. Open it again any time to add more items — only the new items go to the kitchen.',
        'When the guest asks for the bill press Bill (F10) to print it, then Pay (F9) to take payment. The table becomes free.',
        'Per head (cover charge): Settings → Sales & Tax → switch on “Per head charge” and set the rate. On a dine-in bill press Per head, type how many persons (e.g. 3) and Apply — persons × rate is added. You can change the rate for that bill only.',
        'Service charge: Settings → Sales & Tax → switch on “Service charge”. When it applies, press Service on the bill and choose a percent (e.g. 10%) or a fixed Rs amount. Remove clears it.',
        'In the Tables page you can Transfer a bill to another table, Merge bills, Split items to a new bill, or Free a table.',
      ],
      ur: [
        'سیٹنگز ← Sales & Tax میں Dine-In آن کریں۔ Tables پیج میں اپنی ٹیبلیں اور فلورز بنائیں۔',
        'POS میں Dine-In چنیں، ٹیبل اور (چاہیں تو) ویٹر چنیں، آئٹمز ڈالیں اور Save (F8) دبائیں۔ نئے آئٹمز کا کچن ٹکٹ (KOT) چھپ جاتا ہے۔',
        'ٹیبل Running دکھاتی ہے۔ جب چاہیں دوبارہ کھول کر مزید آئٹمز ڈالیں — کچن کو صرف نئے آئٹمز جاتے ہیں۔',
        'مہمان بل مانگے تو Bill (F10) سے بل چھاپیں، پھر Pay (F9) سے ادائیگی لیں۔ ٹیبل فارغ ہو جاتی ہے۔',
        'فی کس چارجز (Per head): سیٹنگز ← Sales & Tax ← “Per head charge” آن کریں اور ریٹ لکھیں۔ ڈائن اِن بل پر Per head دبائیں، افراد کی تعداد لکھیں (مثلاً 3) اور Apply کریں — افراد × ریٹ بل میں جُڑ جاتا ہے۔ صرف اُس بل کے لیے ریٹ بدل بھی سکتے ہیں۔',
        'سروس چارجز: سیٹنگز ← Sales & Tax ← “Service charge” آن کریں۔ جب لگانا ہو تو بل پر Service دبائیں اور فیصد (مثلاً 10%) یا مقررہ رقم چنیں۔ Remove سے ہٹ جاتا ہے۔',
        'Tables پیج پر بل کو دوسری ٹیبل پر Transfer، بل Merge، آئٹمز Split یا ٹیبل Free کر سکتے ہیں۔',
      ],
    },
    tips: {
      en: ['Reserved tables show in a different colour. Dine-in history for any day is in Tables → Dine-in history.'],
      ur: ['ریزرو ٹیبل الگ رنگ میں نظر آتی ہے۔ کسی بھی دن کی ڈائن اِن ہسٹری Tables ← Dine-in history میں ہے۔'],
    },
  },
  {
    id: 'delivery', icon: 'Bike', group: 'selling', to: '/pos', perm: 'pos',
    title: { en: 'Delivery and riders', ur: 'ڈیلیوری اور رائیڈر' },
    where: { en: 'POS → Delivery; Settings → Waiters & Riders; Settings → Sales & Tax', ur: 'POS ← Delivery؛ سیٹنگز ← Waiters & Riders؛ سیٹنگز ← Sales & Tax' },
    steps: {
      en: [
        'Settings → Waiters & Riders → Rider → type the name and press Add. Add every rider once.',
        'In POS choose Delivery. A window asks for the customer name, phone and address — fill it and Save.',
        'Add the items and enter Delivery charges in the bill.',
        'Pick the rider from the Rider list, or choose “✎ Type a name…” and write the name by hand (for a temporary rider).',
        'To make the rider compulsory: Settings → Sales & Tax → “Rider is required for delivery”. The bill then cannot be saved without a rider.',
        'Reports → Rider Report shows deliveries and amounts per rider.',
      ],
      ur: [
        'سیٹنگز ← Waiters & Riders ← Rider میں نام لکھ کر Add دبائیں۔ ہر رائیڈر ایک بار ڈالیں۔',
        'POS میں Delivery چنیں۔ ایک ونڈو گاہک کا نام، فون اور پتہ مانگتی ہے — بھر کر Save کریں۔',
        'آئٹمز ڈالیں اور بل میں Delivery charges لکھیں۔',
        'Rider لسٹ سے رائیڈر چنیں، یا “✎ Type a name…” چن کر نام ہاتھ سے لکھ دیں (عارضی رائیڈر کے لیے)۔',
        'رائیڈر لازمی کرنے کے لیے: سیٹنگز ← Sales & Tax ← “Rider is required for delivery”۔ پھر رائیڈر کے بغیر بل محفوظ نہیں ہوگا۔',
        'Reports ← Rider Report میں ہر رائیڈر کی ڈیلیوریاں اور رقم نظر آتی ہے۔',
      ],
    },
  },
  {
    id: 'hold', icon: 'PauseCircle', group: 'selling', to: '/held', perm: 'pos',
    title: { en: 'Hold, running orders and reprints', ur: 'ہولڈ، رننگ آرڈرز اور دوبارہ پرنٹ' },
    where: { en: 'Sidebar → Hold / Running; POS → F7', ur: 'سائیڈ بار ← Hold / Running؛ POS ← F7' },
    steps: {
      en: [
        'Press Hold (F8) in POS to park a takeaway or delivery order. It appears in Hold / Running.',
        'Open Hold / Running (or press F7 in POS) and tap an order to continue it and take payment.',
        'On each order you can print the bill, print the kitchen ticket (KOT), or cancel it.',
        'Already paid orders: Orders → open the order → Reprint to print the receipt again (reprints never open the cash drawer).',
      ],
      ur: [
        'POS میں Hold (F8) دبا کر ٹیک اوے یا ڈیلیوری آرڈر روک لیں۔ وہ Hold / Running میں آ جاتا ہے۔',
        'Hold / Running کھولیں (یا POS میں F7 دبائیں) اور آرڈر پر ٹیپ کر کے جاری رکھیں اور ادائیگی لیں۔',
        'ہر آرڈر پر بل چھاپ سکتے ہیں، کچن ٹکٹ (KOT) چھاپ سکتے ہیں یا آرڈر منسوخ کر سکتے ہیں۔',
        'ادا شدہ آرڈر: Orders ← آرڈر کھولیں ← Reprint سے رسید دوبارہ چھپتی ہے (دوبارہ پرنٹ پر کیش دراز نہیں کھلتا)۔',
      ],
    },
  },
  {
    id: 'open', icon: 'Banknote', group: 'selling', to: '/products', perm: 'products',
    title: { en: 'Open rate (“khula sauda”) and open items', ur: 'کھلا سودا (اوپن ریٹ) اور اوپن آئٹم' },
    where: { en: 'Products → Add Product → “Rate at sale”; POS → Open Item', ur: 'Products ← Add Product ← “Rate at sale”؛ POS ← Open Item' },
    steps: {
      en: [
        'For items sold by amount (daal, sabzi, “Rs 200 ki daal”): Products → Add Product → give it a name (e.g. Daal Sabzi) and a normal rate, then switch on “Rate at sale (khula sauda)”.',
        'Choose a unit that suits it: portion, plate, bowl, roti, naan, kg… (Unit list in the same form).',
        'In POS tap that item — a pad asks for the amount. Type 200 (or tap a quick amount) and confirm.',
        'The bill prints “Daal Sabzi … Rs 200”. The normal rate you saved is shown only as a suggestion on the pad.',
        'Any item in the bill can also be re-priced: tap the line and change “Rate / amount”. Lowering a fixed price counts as a discount, so it needs discount permission.',
        'For something that is not in your menu at all use POS → Open Item and type the name and price.',
      ],
      ur: [
        'جو چیز رقم کے حساب سے بکتی ہے (دال، سبزی، “دو سو کی دال”): Products ← Add Product میں نام (مثلاً Daal Sabzi) اور عام ریٹ لکھیں، پھر “Rate at sale (khula sauda)” آن کریں۔',
        'مناسب یونٹ چنیں: portion، plate، bowl، roti، naan، kg… (اسی فارم میں Unit لسٹ ہے)۔',
        'POS میں اُس آئٹم پر ٹیپ کریں — ایک پیڈ رقم پوچھے گا۔ 200 لکھیں (یا کوئیک رقم دبائیں) اور تصدیق کریں۔',
        'بل پر “Daal Sabzi … Rs 200” چھپے گا۔ آپ کا محفوظ عام ریٹ صرف پیڈ پر تجویز کے طور پر نظر آتا ہے۔',
        'بل کے کسی بھی آئٹم کا ریٹ بدلنا ہو تو لائن پر ٹیپ کریں اور “Rate / amount” بدلیں۔ مقررہ ریٹ کم کرنا رعایت شمار ہوتا ہے، اس لیے discount کی اجازت چاہیے۔',
        'جو چیز مینو میں ہے ہی نہیں اُس کے لیے POS ← Open Item میں نام اور قیمت لکھیں۔',
      ],
    },
    tips: {
      en: ['Reports still count open-rate sales under their own item name, so you can see how many plates of daal were sold.'],
      ur: ['رپورٹس میں اوپن ریٹ سیلز اُسی آئٹم کے نام سے گنی جاتی ہیں، یعنی آپ دیکھ سکتے ہیں کہ دال کی کتنی پلیٹیں بِکیں۔'],
    },
  },
  {
    id: 'tokens', icon: 'Ticket', group: 'selling', to: '/tokens', perm: 'tokens',
    title: { en: 'Tokens and token items (roti / naan)', ur: 'ٹوکن اور ٹوکن آئٹم (روٹی / نان)' },
    where: { en: 'Settings → Tokens; sidebar → Tokens', ur: 'سیٹنگز ← Tokens؛ سائیڈ بار ← Tokens' },
    steps: {
      en: [
        'Tokens (numbered slips for the customer): Settings → Tokens → switch on “Token system”. A token prints after each sale; the Tokens page tracks Preparing → Ready → Collected.',
        'Token OFF? Then only the kitchen ticket (KOT) prints for takeaway and delivery. You can switch this off in the same tab (“Kitchen ticket (KOT) instead”).',
        'Token items: in Settings → Tokens → “Token items” switch it on, choose the order types (e.g. only Takeaway) and tick the categories or individual items (Roti, Naan…).',
        'In POS, tapping such an item opens a quantity pad. Enter 5 rotis and press “Print token”.',
        'The sale is completed at once as a paid takeaway; a token with the price prints. No receipt and no KOT are printed for it.',
        'Prefer to add that item to a normal bill? Use “Add to the bill instead” on the pad.',
      ],
      ur: [
        'ٹوکن (گاہک کے لیے نمبر والی پرچی): سیٹنگز ← Tokens ← “Token system” آن کریں۔ ہر سیل کے بعد ٹوکن چھپتا ہے؛ Tokens پیج پر Preparing ← Ready ← Collected کی ٹریکنگ ہوتی ہے۔',
        'ٹوکن بند ہو تو ٹیک اوے اور ڈیلیوری پر صرف کچن ٹکٹ (KOT) چھپتا ہے۔ اسی ٹیب میں “Kitchen ticket (KOT) instead” سے یہ طے کر سکتے ہیں۔',
        'ٹوکن آئٹم: سیٹنگز ← Tokens ← “Token items” آن کریں، آرڈر کی قسمیں چنیں (مثلاً صرف Takeaway) اور کیٹیگری یا آئٹم (روٹی، نان…) پر نشان لگائیں۔',
        'POS میں ایسے آئٹم پر ٹیپ کریں تو مقدار والا پیڈ کھلتا ہے۔ 5 روٹیاں لکھیں اور “Print token” دبائیں۔',
        'سیل اُسی وقت ادا شدہ ٹیک اوے کے طور پر مکمل ہو جاتی ہے؛ قیمت والا ٹوکن چھپتا ہے۔ اس کے لیے نہ رسید چھپتی ہے نہ KOT۔',
        'اگر اس آئٹم کو عام بل میں ڈالنا ہو تو پیڈ پر “Add to the bill instead” دبائیں۔',
      ],
    },
    tips: {
      en: ['Reset the token counter every morning from Tokens → Reset counter.'],
      ur: ['ہر صبح Tokens ← Reset counter سے ٹوکن کاؤنٹر نئے سِرے سے شروع کریں۔'],
    },
  },
  {
    id: 'pay', icon: 'Wallet', group: 'selling',
    title: { en: 'Payments, discounts, credit (udhaar) and tax', ur: 'ادائیگی، رعایت، ادھار اور ٹیکس' },
    where: { en: 'POS → Pay (F9), Discount (F6); Settings → Payments; Settings → Sales & Tax', ur: 'POS ← Pay (F9)، Discount (F6)؛ سیٹنگز ← Payments؛ سیٹنگز ← Sales & Tax' },
    steps: {
      en: [
        'Payment methods (Cash, Card, Bank Transfer, Other) can be switched on/off and renamed in Settings → Payments. Quick-cash buttons are set there too.',
        'Bank Transfer: add your accounts in Settings → Payments; each sale remembers the account used, and the account can be printed on the receipt.',
        'Discount (F6) works on the whole bill, as a % or an amount. Item discounts are done on the item line. Only users with discount permission can give them.',
        'Credit / udhaar: attach a customer (F4), then in Pay type less than the total — the rest stays as the customer’s due. Collect it later: open the order (Orders, or Customers → the customer’s orders) and press Receive Due Payment.',
        'GST / service charge and rounding are set in Settings → Sales & Tax and are added automatically.',
      ],
      ur: [
        'ادائیگی کے طریقے (Cash، Card، Bank Transfer، Other) سیٹنگز ← Payments میں آن/آف اور نام تبدیل ہو سکتے ہیں۔ کوئیک کیش بٹن بھی وہیں طے ہوتے ہیں۔',
        'بینک ٹرانسفر: سیٹنگز ← Payments میں اپنے اکاؤنٹ ڈالیں؛ ہر سیل یاد رکھتی ہے کہ کون سا اکاؤنٹ استعمال ہوا، اور اکاؤنٹ رسید پر بھی چھپ سکتا ہے۔',
        'Discount (F6) پورے بل پر لگتا ہے، فیصد یا رقم میں۔ آئٹم کی رعایت آئٹم کی لائن سے ہوتی ہے۔ صرف discount کی اجازت والے یوزر دے سکتے ہیں۔',
        'ادھار: گاہک منتخب کریں (F4)، پھر Pay میں کل رقم سے کم لکھیں — باقی رقم گاہک کے ذمے رہتی ہے۔ بعد میں آرڈر کھول کر (Orders، یا Customers ← کسٹمر کے آرڈر) Receive Due Payment دبائیں۔',
        'GST / سروس چارجز اور راؤنڈنگ سیٹنگز ← Sales & Tax میں طے ہوتے ہیں اور خود بخود شامل ہوتے ہیں۔',
      ],
    },
  },
  {
    id: 'products', icon: 'Package', group: 'menu', to: '/products', perm: 'products',
    title: { en: 'Products, categories, sizes and deals', ur: 'پروڈکٹس، کیٹیگری، سائز اور ڈیل' },
    where: { en: 'Sidebar → Products and Categories', ur: 'سائیڈ بار ← Products اور Categories' },
    steps: {
      en: [
        'Categories first: Categories → Add (name, colour/icon). Use the arrows to set the order shown in POS.',
        'Products → Add Product: name, category, price, optional barcode and picture.',
        'Sizes (Small / Medium / Large, Half / Full): switch on Variants in the product form and add each size with its own price.',
        'Weighed items (sold by kg): choose unit kg and switch on “Sold by weight”. POS then shows a weight pad.',
        'Deals / combos: Products → Deal → choose the items inside and the deal price.',
        'Many items at once: Products → Import Excel (menu import) and Pictures (bulk pictures matched by file name).',
      ],
      ur: [
        'پہلے کیٹیگری: Categories ← Add (نام، رنگ/آئیکن)۔ تیر والے بٹن سے POS میں ترتیب طے کریں۔',
        'Products ← Add Product: نام، کیٹیگری، قیمت، اور چاہیں تو بارکوڈ اور تصویر۔',
        'سائز (Small / Medium / Large، Half / Full): پروڈکٹ فارم میں Variants آن کریں اور ہر سائز کی الگ قیمت ڈالیں۔',
        'وزن سے بکنے والی چیز (کلو): یونٹ kg چنیں اور “Sold by weight” آن کریں۔ پھر POS وزن والا پیڈ دکھاتا ہے۔',
        'ڈیل / کومبو: Products ← Deal ← اندر کے آئٹمز اور ڈیل کی قیمت چنیں۔',
        'ایک ساتھ بہت سے آئٹمز: Products ← Import Excel (مینو امپورٹ) اور Pictures (فائل کے نام سے تصاویر خود لگتی ہیں)۔',
      ],
    },
  },
  {
    id: 'invmode', icon: 'ChefHat', group: 'menu', to: '/inventory', perm: 'inventory',
    title: { en: 'Inventory: Retail or Restaurant mode', ur: 'انوینٹری: ریٹیل یا ریسٹورنٹ موڈ' },
    where: { en: 'Inventory (first visit) or Settings → Inventory', ur: 'Inventory (پہلی بار) یا سیٹنگز ← Inventory' },
    steps: {
      en: [
        'The first time you open Inventory (or Settings → Inventory) you choose how your business works: Retail or Restaurant.',
        'Retail: every product is its own stock (shirts, groceries, mobiles). Sales reduce that product’s stock. Add stock with Stock In.',
        'Restaurant: your menu items (biryani, karahi) are NOT stock. You add raw items instead — ghee, gosht, daal, chicken, atta — in Inventory → Add inventory item.',
        'Then open each menu item (Products → edit) and under “Recipe management” choose which raw items, and how much, one plate uses. Every sale takes them out of stock automatically.',
        'Buy raw items with Stock In, record waste with Stock Out, and correct the count with Adjust.',
        'Your choice is locked for good once saved, so the data cannot get mixed up. Only a Factory reset opens it again. Inventory itself can still be switched on/off.',
      ],
      ur: [
        'جب آپ پہلی بار Inventory (یا سیٹنگز ← Inventory) کھولتے ہیں تو آپ کاروبار کی قسم چنتے ہیں: Retail یا Restaurant۔',
        'Retail: ہر پروڈکٹ خود اسٹاک ہے (کپڑے، گروسری، موبائل)۔ سیل سے اُسی پروڈکٹ کا اسٹاک کم ہوتا ہے۔ اسٹاک Stock In سے بڑھائیں۔',
        'Restaurant: مینو آئٹمز (بریانی، کڑاہی) اسٹاک نہیں ہوتے۔ آپ خام مال خود ڈالتے ہیں — گھی، گوشت، دال، چکن، آٹا — Inventory ← Add inventory item میں۔',
        'پھر ہر مینو آئٹم (Products میں ایڈٹ) کے “Recipe management” میں چنیں کہ ایک پلیٹ میں کون سا خام مال کتنا لگتا ہے۔ ہر سیل پر یہ خود بخود اسٹاک سے نکلتا ہے۔',
        'خام مال کی خریداری Stock In سے، ضائع ہونا Stock Out سے، اور گنتی کی درستی Adjust سے کریں۔',
        'ایک بار محفوظ کرنے کے بعد یہ انتخاب ہمیشہ کے لیے لاک ہو جاتا ہے تاکہ ڈیٹا گڈ مڈ نہ ہو۔ صرف Factory reset سے کھلتا ہے۔ انوینٹری کو آن/آف البتہ کیا جا سکتا ہے۔',
      ],
    },
    tips: {
      en: ['Choose carefully: a restaurant should pick Restaurant, a shop should pick Retail. The screen suggests one from your business type.'],
      ur: ['سوچ سمجھ کر چنیں: ریسٹورنٹ Restaurant چنے اور دکان Retail۔ اسکرین آپ کے بزنس ٹائپ سے ایک تجویز دیتی ہے۔'],
    },
  },
  {
    id: 'stock', icon: 'Boxes', group: 'menu', to: '/inventory', perm: 'inventory',
    title: { en: 'Stock in, stock out and low-stock alerts', ur: 'اسٹاک اِن، اسٹاک آؤٹ اور کم اسٹاک کی اطلاع' },
    where: { en: 'Sidebar → Inventory', ur: 'سائیڈ بار ← Inventory' },
    steps: {
      en: [
        'Stock In (Purchase): choose the item, quantity and the purchase cost. The average cost updates, which Profit Report uses.',
        'Stock Out (Waste / Use): for spoiled, staff-meal or damaged goods.',
        'Adjust to Counted Stock: after counting the shelf, type the real number; the difference is recorded.',
        'Use the Low stock and Out of stock filters; set “Low stock alert at” on each item (Products → edit).',
        'Stock History shows every movement (sale, refund, purchase, adjustment) with date and user.',
      ],
      ur: [
        'Stock In (خریداری): آئٹم، مقدار اور خریداری کی لاگت چنیں۔ اوسط لاگت اپ ڈیٹ ہوتی ہے جو Profit Report میں استعمال ہوتی ہے۔',
        'Stock Out (ضائع / استعمال): خراب، اسٹاف کے کھانے یا ٹوٹ پھوٹ والے مال کے لیے۔',
        'Adjust to Counted Stock: شیلف گن کر اصل تعداد لکھیں؛ فرق ریکارڈ ہو جاتا ہے۔',
        'Low stock اور Out of stock فلٹر استعمال کریں؛ ہر آئٹم پر “Low stock alert at” طے کریں (Products ← ایڈٹ)۔',
        'Stock History میں ہر حرکت (سیل، ریفنڈ، خریداری، ایڈجسٹمنٹ) تاریخ اور یوزر کے ساتھ دکھائی دیتی ہے۔',
      ],
    },
  },
  {
    id: 'customers', icon: 'Users2', group: 'menu', to: '/customers', perm: 'customers',
    title: { en: 'Customers and dues', ur: 'کسٹمرز اور بقایا جات' },
    where: { en: 'Sidebar → Customers; POS → F4', ur: 'سائیڈ بار ← Customers؛ POS ← F4' },
    steps: {
      en: [
        'Add a customer in Customers → Add, or straight from POS (F4) while billing.',
        'Attach the customer to a sale to keep their history and credit balance. Delivery orders need name, phone and address.',
        'The customer list has a Due column. Open a customer to see every order, then open an order with a due and press Receive Due Payment.',
      ],
      ur: [
        'Customers ← Add سے کسٹمر ڈالیں، یا بل بناتے ہوئے POS (F4) سے ہی ڈال دیں۔',
        'سیل میں کسٹمر شامل کریں تاکہ اُس کی ہسٹری اور ادھار محفوظ رہے۔ ڈیلیوری آرڈر کے لیے نام، فون اور پتہ ضروری ہے۔',
        'کسٹمر لسٹ میں Due کا کالم ہے۔ کسٹمر کھول کر تمام آرڈر دیکھیں، پھر بقایا والا آرڈر کھول کر Receive Due Payment دبائیں۔',
      ],
    },
  },
  {
    id: 'printers', icon: 'Printer', group: 'setup',
    title: { en: 'Connecting printers (Bluetooth, USB, COM)', ur: 'پرنٹر جوڑنا (بلوٹوتھ، USB، COM)' },
    where: { en: 'Settings → Printers → Add a printer', ur: 'سیٹنگز ← Printers ← Add a printer' },
    steps: {
      en: [
        'Bluetooth (58 mm mini printers, MediaLink, SpeedX, Xprinter…): switch the printer on, press Add a printer → Bluetooth → Search, choose it and press Pair. The PIN is usually 0000 or 1234 (both are tried automatically).',
        'After pairing, Windows makes a COM port (e.g. COM5) for the printer. Press Test print, then “Use for receipts”. No driver needed — the software prints straight to the port.',
        'USB printer with its driver installed: it already appears in the printer list. Select it as the Receipt printer.',
        'USB printer without a driver: Add a printer → USB (no driver) → Install. Windows asks permission once; the built-in generic driver is installed.',
        'Kitchen printer: choose a second printer under “Token / kitchen printer”, or use “Use for kitchen / tokens” in the Add a printer window.',
        'Always finish with Verify printers and a Test receipt. Set paper width (58 / 80 mm) in the Receipt tab.',
      ],
      ur: [
        'بلوٹوتھ (58 ملی میٹر منی پرنٹر، MediaLink، SpeedX، Xprinter…): پرنٹر آن کریں، Add a printer ← Bluetooth ← Search دبائیں، پرنٹر چنیں اور Pair دبائیں۔ PIN عموماً 0000 یا 1234 ہوتا ہے (دونوں خود آزمائے جاتے ہیں)۔',
        'پیئر ہونے کے بعد ونڈوز پرنٹر کے لیے ایک COM پورٹ (مثلاً COM5) بناتی ہے۔ Test print دبائیں، پھر “Use for receipts”۔ ڈرائیور کی ضرورت نہیں — سافٹ ویئر سیدھا پورٹ پر چھاپتا ہے۔',
        'USB پرنٹر جس کا ڈرائیور لگا ہو: وہ پرنٹر لسٹ میں پہلے سے آ جاتا ہے۔ اسے Receipt printer چن لیں۔',
        'USB پرنٹر بغیر ڈرائیور: Add a printer ← USB (no driver) ← Install۔ ونڈوز ایک بار اجازت مانگتی ہے؛ ونڈوز کا اپنا جنرک ڈرائیور لگ جاتا ہے۔',
        'کچن پرنٹر: “Token / kitchen printer” میں دوسرا پرنٹر چنیں، یا Add a printer ونڈو میں “Use for kitchen / tokens” دبائیں۔',
        'آخر میں ہمیشہ Verify printers اور Test receipt کریں۔ کاغذ کی چوڑائی (58 / 80 mm) Receipt ٹیب میں طے کریں۔',
      ],
    },
    tips: {
      en: [
        'Half bill or strange characters on a Bluetooth printer? Add a printer → COM port → Sending speed: Safe.',
        'Printer not found? Make sure it is not connected to a phone at the same time, and that Bluetooth is on in Windows.',
        'Pairing and direct COM printing depend on the printer and the Bluetooth adapter. Test once on the shop computer before opening day.',
      ],
      ur: [
        'بلوٹوتھ پرنٹر آدھا بل یا عجیب حروف چھاپے؟ Add a printer ← COM port ← Sending speed: Safe کریں۔',
        'پرنٹر نہیں ملا؟ دیکھیں کہ وہ ایک ہی وقت میں موبائل سے جڑا تو نہیں اور ونڈوز میں بلوٹوتھ آن ہے۔',
        'پیئرنگ اور براہِ راست COM پرنٹنگ پرنٹر اور بلوٹوتھ ایڈاپٹر پر منحصر ہے۔ دکان کھولنے سے پہلے دکان کے کمپیوٹر پر ایک بار ٹیسٹ ضرور کریں۔',
      ],
    },
  },
  {
    id: 'receipt', icon: 'ReceiptText', group: 'setup',
    title: { en: 'Receipt design, logo and footer', ur: 'رسید کا ڈیزائن، لوگو اور فُوٹر' },
    where: { en: 'Settings → Receipt', ur: 'سیٹنگز ← Receipt' },
    steps: {
      en: [
        'Choose paper width (58 / 80 mm) and one of the receipt designs; the preview on the right updates live.',
        'Tick what to show: logo, order number, cashier, customer, table, payment details, discount breakdown, NTN, item notes, amount in words, and a QR code.',
        'Type your own Footer message (for example “Thank you — visit again”). Urdu text is supported.',
        'Uneven left/right margins? Settings → Printers → Margin test, then adjust “Side balance”.',
      ],
      ur: [
        'کاغذ کی چوڑائی (58 / 80 mm) اور رسید کا ڈیزائن چنیں؛ دائیں طرف پریویو ساتھ ساتھ بدلتا ہے۔',
        'جو چیزیں دکھانی ہیں اُن پر نشان لگائیں: لوگو، آرڈر نمبر، کیشیئر، کسٹمر، ٹیبل، ادائیگی کی تفصیل، رعایت کی تفصیل، NTN، آئٹم نوٹ، رقم الفاظ میں، اور QR کوڈ۔',
        'اپنا Footer message لکھیں (مثلاً “شکریہ — دوبارہ تشریف لائیں”)۔ اردو متن چلتا ہے۔',
        'دائیں بائیں مارجن برابر نہیں؟ سیٹنگز ← Printers ← Margin test کریں، پھر “Side balance” ٹھیک کریں۔',
      ],
    },
  },
  {
    id: 'reports', icon: 'BarChart3', group: 'manage', to: '/reports', perm: 'reports',
    title: { en: 'Reports and the Day Summary (Z report)', ur: 'رپورٹس اور ڈے سمری (Z رپورٹ)' },
    where: { en: 'Sidebar → Reports; Dashboard', ur: 'سائیڈ بار ← Reports؛ Dashboard' },
    steps: {
      en: [
        'Dashboard shows today’s sales, orders, top items and low stock at a glance.',
        'Reports → choose a report on the left (Sales, Product Sales, Payments, Credit / Due, Profit, Cashier, Waiter, Rider, Inventory…), pick the dates and read the table.',
        'End of day: open Day Summary (Z Report), check cash against the drawer, then print it on A4 or 58 / 80 mm paper, or Save PNG to share on WhatsApp.',
        'Use the Excel / PDF buttons to export any report.',
      ],
      ur: [
        'Dashboard پر آج کی سیل، آرڈرز، ٹاپ آئٹمز اور کم اسٹاک ایک نظر میں نظر آتا ہے۔',
        'Reports میں بائیں طرف سے رپورٹ چنیں (Sales، Product Sales، Payments، Credit / Due، Profit، Cashier، Waiter، Rider، Inventory…)، تاریخیں چنیں اور ٹیبل دیکھیں۔',
        'دن کے اختتام پر Day Summary (Z Report) کھولیں، دراز کے کیش سے ملائیں، پھر A4 یا 58 / 80 mm کاغذ پر چھاپیں، یا Save PNG سے واٹس ایپ پر بھیجیں۔',
        'کوئی بھی رپورٹ Excel / PDF بٹن سے ایکسپورٹ ہو جاتی ہے۔',
      ],
    },
  },
  {
    id: 'staff', icon: 'UserCog', group: 'manage', to: '/users', perm: 'users',
    title: { en: 'Users, permissions, waiters and riders', ur: 'یوزرز، اجازتیں، ویٹر اور رائیڈر' },
    where: { en: 'Sidebar → Users; Settings → Waiters & Riders', ur: 'سائیڈ بار ← Users؛ سیٹنگز ← Waiters & Riders' },
    steps: {
      en: [
        'Users → Add User: name, PIN and role (Admin, Manager, Cashier). Each cashier then logs in with their own PIN.',
        'Edit a user to tick exactly which modules and actions they may use (for example no Reports, no discounts).',
        'Waiters and riders are not logins — they are names for reports. Add them in Settings → Waiters & Riders.',
        'Reports → Cashier / Waiter / Rider Report show each person’s sales.',
      ],
      ur: [
        'Users ← Add User: نام، PIN اور رول (Admin، Manager، Cashier)۔ ہر کیشیئر پھر اپنے PIN سے لاگ اِن کرتا ہے۔',
        'یوزر ایڈٹ کر کے ٹھیک ٹھیک چنیں کہ وہ کون سے ماڈیول اور کام کر سکتا ہے (مثلاً Reports نہیں، رعایت نہیں)۔',
        'ویٹر اور رائیڈر لاگ اِن نہیں ہوتے — یہ رپورٹس کے لیے نام ہیں۔ انہیں سیٹنگز ← Waiters & Riders میں ڈالیں۔',
        'Reports ← Cashier / Waiter / Rider Report میں ہر شخص کی سیل نظر آتی ہے۔',
      ],
    },
  },
  {
    id: 'backup', icon: 'DatabaseBackup', group: 'manage',
    title: { en: 'Backup, restore and export', ur: 'بیک اپ، ریسٹور اور ایکسپورٹ' },
    where: { en: 'Settings → Backup & Restore', ur: 'سیٹنگز ← Backup & Restore' },
    steps: {
      en: [
        'Auto backup is on by default. Press Backup now for an extra copy any time.',
        'Backup to USB / folder… copies the data to a pen drive — keep one outside the shop.',
        'Restore: pick a backup from the list and press Restore. The current data is replaced.',
        'Export all data to Excel or JSON, and Import Excel / JSON to bring it back or move to a new computer.',
      ],
      ur: [
        'آٹو بیک اپ پہلے سے آن ہوتا ہے۔ اضافی کاپی کے لیے کسی بھی وقت Backup now دبائیں۔',
        'Backup to USB / folder… ڈیٹا پین ڈرائیو میں کاپی کرتا ہے — ایک کاپی دکان سے باہر رکھیں۔',
        'ریسٹور: لسٹ سے بیک اپ چنیں اور Restore دبائیں۔ موجودہ ڈیٹا بدل جاتا ہے۔',
        'تمام ڈیٹا Excel یا JSON میں ایکسپورٹ کریں، اور Import Excel / JSON سے واپس لائیں یا نئے کمپیوٹر پر منتقل کریں۔',
      ],
    },
    tips: {
      en: ['Take a backup before Factory reset, before changing computer and before big imports.'],
      ur: ['Factory reset سے پہلے، کمپیوٹر بدلنے سے پہلے اور بڑے امپورٹ سے پہلے بیک اپ ضرور لیں۔'],
    },
  },
  {
    id: 'license', icon: 'KeyRound', group: 'manage',
    title: { en: 'License, updates and contacting support', ur: 'لائسنس، اپ ڈیٹ اور سپورٹ سے رابطہ' },
    where: { en: 'Settings → License; Settings → Support', ur: 'سیٹنگز ← License؛ سیٹنگز ← Support' },
    steps: {
      en: [
        'Settings → License shows your plan, expiry and device. To activate, enter the key from your provider.',
        'The software works fully offline. Internet is needed only for licence checks, support messages and backups you send yourself.',
        'Need help? Settings → Support → Message provider. Your provider’s reply appears there and a notice shows at the top of the screen.',
        'For urgent matters use the call / WhatsApp buttons in Settings → General (About card).',
      ],
      ur: [
        'سیٹنگز ← License میں پلان، میعاد اور ڈیوائس نظر آتی ہے۔ ایکٹیویٹ کرنے کے لیے پروائیڈر کی دی ہوئی کی (key) لکھیں۔',
        'سافٹ ویئر مکمل طور پر آف لائن چلتا ہے۔ انٹرنیٹ صرف لائسنس چیک، سپورٹ پیغامات اور آپ کے اپنے بھیجے ہوئے بیک اپ کے لیے چاہیے۔',
        'مدد چاہیے؟ سیٹنگز ← Support ← Message provider۔ پروائیڈر کا جواب وہیں آتا ہے اور اسکرین کے اوپر اطلاع بھی نظر آتی ہے۔',
        'ضروری معاملے میں سیٹنگز ← General (About کارڈ) کے کال / واٹس ایپ بٹن استعمال کریں۔',
      ],
    },
  },
  {
    id: 'keys', icon: 'Keyboard', group: 'basics',
    title: { en: 'Keyboard shortcuts (POS)', ur: 'کی بورڈ شارٹ کٹس (POS)' },
    where: { en: 'POS / New Sale screen', ur: 'POS / New Sale اسکرین' },
    steps: {
      en: ['F2 — search product / scan barcode', 'F3 — new order', 'F4 — choose customer', 'F6 — discount', 'F7 — held & running orders', 'F8 — save / hold order', 'F9 — pay', 'F10 — save and print bill (dine-in)', 'Esc — close a window or clear the search'],
      ur: ['F2 — پروڈکٹ تلاش / بارکوڈ اسکین', 'F3 — نیا آرڈر', 'F4 — کسٹمر چنیں', 'F6 — رعایت (discount)', 'F7 — ہولڈ اور رننگ آرڈرز', 'F8 — آرڈر محفوظ / ہولڈ', 'F9 — ادائیگی', 'F10 — محفوظ کریں اور بل چھاپیں (ڈائن اِن)', 'Esc — ونڈو بند کریں یا سرچ صاف کریں'],
    },
  },
  {
    id: 'fix', icon: 'Wrench', group: 'basics',
    title: { en: 'Quick fixes for common problems', ur: 'عام مسائل کا فوری حل' },
    where: { en: 'Settings → Printers; Settings → General', ur: 'سیٹنگز ← Printers؛ سیٹنگز ← General' },
    steps: {
      en: [
        'Nothing prints: Settings → Printers → Verify printers. Check the printer is on, paper is loaded, and the cable / Bluetooth is connected. Press Detect again.',
        'Blank paper before the receipt: use Print method “Thermal — fast” and reduce Extra feed.',
        'Wrong cut position: change Extra feed, or tick “Compatibility cut”.',
        'Forgot PIN: another admin can reset it in Users. If there is no other admin, contact your provider.',
        'Wrong stock numbers: Inventory → Adjust to the counted quantity. Every change is kept in Stock History.',
        'Computer crashed or changed: install the software, then Settings → Backup & Restore → Restore your last backup.',
      ],
      ur: [
        'کچھ نہیں چھپتا: سیٹنگز ← Printers ← Verify printers۔ دیکھیں پرنٹر آن ہے، کاغذ لگا ہے اور کیبل / بلوٹوتھ جڑا ہے۔ Detect again دبائیں۔',
        'رسید سے پہلے خالی کاغذ نکلتا ہے: پرنٹ میتھڈ “Thermal — fast” رکھیں اور Extra feed کم کریں۔',
        'کٹنگ کی جگہ غلط ہے: Extra feed بدلیں یا “Compatibility cut” پر نشان لگائیں۔',
        'PIN بھول گئے: دوسرا ایڈمن Users میں ری سیٹ کر سکتا ہے۔ دوسرا ایڈمن نہ ہو تو پروائیڈر سے رابطہ کریں۔',
        'اسٹاک غلط ہے: Inventory ← Adjust سے گنتی کے مطابق درست کریں۔ ہر تبدیلی Stock History میں محفوظ رہتی ہے۔',
        'کمپیوٹر خراب یا تبدیل ہوا: سافٹ ویئر لگائیں، پھر سیٹنگز ← Backup & Restore سے آخری بیک اپ Restore کریں۔',
      ],
    },
  },
];

export const FAQ = [
  {
    q: { en: 'Does the software need internet?', ur: 'کیا سافٹ ویئر کو انٹرنیٹ چاہیے؟' },
    a: { en: 'No. Selling, printing, stock and reports all work offline. Internet is used only for the licence check and for messages to your provider.', ur: 'نہیں۔ سیل، پرنٹنگ، اسٹاک اور رپورٹس سب آف لائن چلتے ہیں۔ انٹرنیٹ صرف لائسنس چیک اور پروائیڈر کو پیغامات کے لیے استعمال ہوتا ہے۔' },
  },
  {
    q: { en: 'Where is my data stored?', ur: 'میرا ڈیٹا کہاں محفوظ ہوتا ہے؟' },
    a: { en: 'On this computer only. Settings → Backup & Restore → “Open data folder” shows the place. Keep a USB backup outside the shop.', ur: 'صرف اسی کمپیوٹر پر۔ سیٹنگز ← Backup & Restore ← “Open data folder” جگہ دکھاتا ہے۔ ایک USB بیک اپ دکان سے باہر رکھیں۔' },
  },
  {
    q: { en: 'How do I sell “Rs 200 ki daal”?', ur: '“دو سو کی دال” کیسے بیچوں؟' },
    a: { en: 'Turn on “Rate at sale (khula sauda)” in that product. In POS tap it, type 200 on the pad — the bill prints the item with Rs 200.', ur: 'اُس پروڈکٹ میں “Rate at sale (khula sauda)” آن کریں۔ POS میں ٹیپ کر کے پیڈ پر 200 لکھیں — بل پر آئٹم Rs 200 کے ساتھ چھپتا ہے۔' },
  },
  {
    q: { en: 'Can I change Retail / Restaurant later?', ur: 'کیا ریٹیل / ریسٹورنٹ بعد میں بدل سکتا ہوں؟' },
    a: { en: 'No — it is locked once saved so stock data cannot get mixed. Only a Factory reset unlocks it. You can still switch Inventory on or off.', ur: 'نہیں — محفوظ ہونے کے بعد لاک ہو جاتا ہے تاکہ اسٹاک کا ڈیٹا گڈ مڈ نہ ہو۔ صرف Factory reset اسے کھولتا ہے۔ انوینٹری آن/آف کی جا سکتی ہے۔' },
  },
  {
    q: { en: 'In Restaurant mode, where did product stock go?', ur: 'ریسٹورنٹ موڈ میں پروڈکٹ کا اسٹاک کہاں گیا؟' },
    a: { en: 'Menu items do not hold stock any more. Your raw items (ghee, gosht, daal…) are the stock, and each dish’s recipe decides how much is used per sale.', ur: 'مینو آئٹمز اب اسٹاک نہیں رکھتے۔ آپ کا خام مال (گھی، گوشت، دال…) ہی اسٹاک ہے، اور ہر ڈش کی ریسیپی طے کرتی ہے کہ ایک سیل پر کتنا لگے گا۔' },
  },
  {
    q: { en: 'My Bluetooth printer is not in the search list.', ur: 'میرا بلوٹوتھ پرنٹر سرچ لسٹ میں نہیں آ رہا۔' },
    a: { en: 'Switch it on and keep it within 1–2 metres. Disconnect it from any phone. Make sure Bluetooth is on in Windows, then Search again. If it still does not show, pair it in Windows Bluetooth settings (button in the Add a printer window).', ur: 'پرنٹر آن کریں اور ایک دو میٹر کے اندر رکھیں۔ اسے موبائل سے ڈس کنیکٹ کریں۔ ونڈوز میں بلوٹوتھ آن ہو، پھر دوبارہ Search کریں۔ پھر بھی نہ آئے تو ونڈوز کی بلوٹوتھ سیٹنگز میں پیئر کریں (Add a printer ونڈو میں بٹن موجود ہے)۔' },
  },
  {
    q: { en: 'The token printed but there is no receipt.', ur: 'ٹوکن چھپ گیا مگر رسید نہیں چھپی۔' },
    a: { en: 'That is how Token items work: the sale completes at once and only the priced token prints. For a receipt use “Add to the bill instead”, or reprint from Orders.', ur: 'ٹوکن آئٹم کا یہی طریقہ ہے: سیل اسی وقت مکمل ہوتی ہے اور صرف قیمت والا ٹوکن چھپتا ہے۔ رسید چاہیے تو “Add to the bill instead” استعمال کریں یا Orders سے دوبارہ پرنٹ کریں۔' },
  },
  {
    q: { en: 'How do I charge per head at dine-in?', ur: 'ڈائن اِن میں فی کس (per head) چارجز کیسے لگاؤں؟' },
    a: { en: 'Settings → Sales & Tax → “Per head charge” → set the rate. On the dine-in bill press Per head, type the number of persons, Apply. A Service button adds a service charge in % or Rs in the same way.', ur: 'سیٹنگز ← Sales & Tax ← “Per head charge” ← ریٹ لکھیں۔ ڈائن اِن بل پر Per head دبائیں، افراد کی تعداد لکھیں، Apply۔ اسی طرح Service بٹن فیصد یا رقم میں سروس چارجز لگاتا ہے۔' },
  },
  {
    q: { en: 'Can the cashier give discounts?', ur: 'کیا کیشیئر رعایت دے سکتا ہے؟' },
    a: { en: 'Only if you allow it. Users → edit the user → tick Discount. Without it the Discount button is hidden and item prices cannot be lowered.', ur: 'صرف جب آپ اجازت دیں۔ Users ← یوزر ایڈٹ ← Discount پر نشان لگائیں۔ اجازت نہ ہو تو Discount بٹن چھپ جاتا ہے اور آئٹم کا ریٹ کم نہیں ہو سکتا۔' },
  },
  {
    q: { en: 'How do I cancel or refund a sale?', ur: 'سیل کیسے منسوخ یا ریفنڈ کروں؟' },
    a: { en: 'Orders → open the sale → Refund (for paid sales) or Cancel (for unpaid / held). Stock is returned automatically.', ur: 'Orders ← سیل کھولیں ← Refund (ادا شدہ کے لیے) یا Cancel (غیر ادا / ہولڈ کے لیے)۔ اسٹاک خود بخود واپس ہو جاتا ہے۔' },
  },
  {
    q: { en: 'How do I move to a new computer?', ur: 'نئے کمپیوٹر پر کیسے جاؤں؟' },
    a: { en: 'Backup now (or Export JSON) on the old computer, copy the file, install the software on the new one and Restore / Import it. Your licence can be moved by your provider.', ur: 'پرانے کمپیوٹر پر Backup now (یا Export JSON) کریں، فائل کاپی کریں، نئے پر سافٹ ویئر لگا کر Restore / Import کریں۔ لائسنس پروائیڈر منتقل کر دے گا۔' },
  },
  {
    q: { en: 'Why does Urdu text look different on my computer?', ur: 'اردو متن میرے کمپیوٹر پر مختلف کیوں نظر آتا ہے؟' },
    a: { en: 'The guide uses the Jameel Noori Nastaleeq font if it is installed on Windows, otherwise a built-in Nastaliq font. Install Jameel Noori for the classic look.', ur: 'گائیڈ ونڈوز میں جمیل نوری نستعلیق فونٹ ہو تو وہی استعمال کرتی ہے، ورنہ اپنا نستعلیق فونٹ۔ روایتی شکل کے لیے جمیل نوری انسٹال کر لیں۔' },
  },
];

export const GROUPS = {
  basics: { en: 'Basics', ur: 'بنیادی باتیں' },
  selling: { en: 'Selling', ur: 'سیل' },
  menu: { en: 'Menu & stock', ur: 'مینو اور اسٹاک' },
  setup: { en: 'Setup', ur: 'سیٹ اپ' },
  manage: { en: 'Manage', ur: 'انتظام' },
};

export const UI = {
  title: { en: 'Help guide', ur: 'مدد گائیڈ' },
  sub: { en: 'How to use every part of DT Retail POS — step by step.', ur: 'ڈی ٹی ریٹیل POS کے ہر حصے کا استعمال — قدم بہ قدم۔' },
  search: { en: 'Search the guide…', ur: 'گائیڈ میں تلاش کریں…' },
  where: { en: 'Where to find it', ur: 'کہاں ملے گا' },
  steps: { en: 'Steps', ur: 'طریقہ' },
  tips: { en: 'Good to know', ur: 'کام کی بات' },
  open: { en: 'Open this page', ur: 'یہ صفحہ کھولیں' },
  faq: { en: 'Frequently asked questions', ur: 'اکثر پوچھے جانے والے سوالات' },
  none: { en: 'Nothing found. Try another word, or write to your provider in “Message provider”.', ur: 'کچھ نہیں ملا۔ کوئی اور لفظ آزمائیں، یا “Message provider” میں پروائیڈر کو لکھیں۔' },
  topics: { en: 'topics', ur: 'عنوانات' },
};
