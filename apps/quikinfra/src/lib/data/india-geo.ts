/**
 * Indian States + Union Territories and their major cities.
 *
 * Used by StateCitySelect in master/transaction forms to give a cascading
 * state → city picker. Static dataset (no API) so it works offline and
 * has no rate limits.
 *
 * Coverage: all 28 states + 8 UTs, with ~15–30 major cities each
 * (population > 100k or significant admin/commercial centers).
 */

export interface IndianState {
  code: string;   // 2-letter state code
  name: string;   // Display name used as the form value
}

export const INDIAN_STATES: IndianState[] = [
  { code: "AP", name: "Andhra Pradesh" },
  { code: "AR", name: "Arunachal Pradesh" },
  { code: "AS", name: "Assam" },
  { code: "BR", name: "Bihar" },
  { code: "CG", name: "Chhattisgarh" },
  { code: "GA", name: "Goa" },
  { code: "GJ", name: "Gujarat" },
  { code: "HR", name: "Haryana" },
  { code: "HP", name: "Himachal Pradesh" },
  { code: "JH", name: "Jharkhand" },
  { code: "KA", name: "Karnataka" },
  { code: "KL", name: "Kerala" },
  { code: "MP", name: "Madhya Pradesh" },
  { code: "MH", name: "Maharashtra" },
  { code: "MN", name: "Manipur" },
  { code: "ML", name: "Meghalaya" },
  { code: "MZ", name: "Mizoram" },
  { code: "NL", name: "Nagaland" },
  { code: "OD", name: "Odisha" },
  { code: "PB", name: "Punjab" },
  { code: "RJ", name: "Rajasthan" },
  { code: "SK", name: "Sikkim" },
  { code: "TN", name: "Tamil Nadu" },
  { code: "TS", name: "Telangana" },
  { code: "TR", name: "Tripura" },
  { code: "UP", name: "Uttar Pradesh" },
  { code: "UK", name: "Uttarakhand" },
  { code: "WB", name: "West Bengal" },
  { code: "AN", name: "Andaman and Nicobar Islands" },
  { code: "CH", name: "Chandigarh" },
  { code: "DN", name: "Dadra and Nagar Haveli and Daman and Diu" },
  { code: "DL", name: "Delhi" },
  { code: "JK", name: "Jammu and Kashmir" },
  { code: "LA", name: "Ladakh" },
  { code: "LD", name: "Lakshadweep" },
  { code: "PY", name: "Puducherry" },
];

export const CITIES_BY_STATE: Record<string, string[]> = {
  "Andhra Pradesh": [
    "Visakhapatnam", "Vijayawada", "Guntur", "Nellore", "Kurnool", "Rajahmundry",
    "Tirupati", "Kakinada", "Kadapa", "Anantapur", "Vizianagaram", "Eluru",
    "Ongole", "Chittoor", "Srikakulam", "Machilipatnam", "Proddatur", "Tenali",
    "Adoni", "Nandyal", "Madanapalle", "Hindupur", "Bhimavaram",
  ],
  "Arunachal Pradesh": [
    "Itanagar", "Naharlagun", "Pasighat", "Tawang", "Ziro", "Bomdila",
    "Tezu", "Along", "Roing", "Khonsa", "Changlang", "Daporijo",
  ],
  "Assam": [
    "Guwahati", "Silchar", "Dibrugarh", "Jorhat", "Nagaon", "Tinsukia",
    "Tezpur", "Bongaigaon", "Dhubri", "North Lakhimpur", "Karimganj",
    "Sivasagar", "Goalpara", "Barpeta", "Diphu", "Golaghat", "Haflong", "Mangaldoi",
  ],
  "Bihar": [
    "Patna", "Gaya", "Bhagalpur", "Muzaffarpur", "Darbhanga", "Purnia",
    "Bihar Sharif", "Arrah", "Begusarai", "Katihar", "Munger", "Chhapra",
    "Danapur", "Bettiah", "Saharsa", "Hajipur", "Sasaram", "Dehri", "Siwan",
    "Motihari", "Nawada", "Bagaha", "Buxar", "Kishanganj", "Sitamarhi", "Jamalpur",
  ],
  "Chhattisgarh": [
    "Raipur", "Bhilai", "Bilaspur", "Korba", "Durg", "Rajnandgaon",
    "Jagdalpur", "Raigarh", "Ambikapur", "Mahasamund", "Dhamtari", "Chirmiri",
    "Janjgir", "Sakti", "Dalli-Rajhara", "Naila Janjgir",
  ],
  "Goa": [
    "Panaji", "Vasco da Gama", "Margao", "Mapusa", "Ponda", "Bicholim",
    "Curchorem", "Sanquelim", "Cuncolim", "Quepem", "Canacona", "Pernem",
  ],
  "Gujarat": [
    "Ahmedabad", "Surat", "Vadodara", "Rajkot", "Bhavnagar", "Jamnagar",
    "Junagadh", "Gandhinagar", "Anand", "Navsari", "Morbi", "Nadiad",
    "Surendranagar", "Bharuch", "Mehsana", "Gandhidham", "Porbandar", "Vapi",
    "Palanpur", "Valsad", "Veraval", "Godhra", "Bhuj", "Ankleshwar", "Dahod",
  ],
  "Haryana": [
    "Faridabad", "Gurugram", "Panipat", "Ambala", "Yamunanagar", "Rohtak",
    "Hisar", "Karnal", "Sonipat", "Panchkula", "Bhiwani", "Sirsa",
    "Bahadurgarh", "Jind", "Thanesar", "Kaithal", "Rewari", "Palwal",
    "Hansi", "Narnaul", "Fatehabad", "Gohana", "Tohana",
  ],
  "Himachal Pradesh": [
    "Shimla", "Dharamshala", "Solan", "Mandi", "Palampur", "Kullu",
    "Hamirpur", "Una", "Nahan", "Bilaspur", "Chamba", "Kangra",
    "Baddi", "Manali", "Sundarnagar", "Paonta Sahib", "Nurpur",
  ],
  "Jharkhand": [
    "Ranchi", "Jamshedpur", "Dhanbad", "Bokaro Steel City", "Deoghar", "Phusro",
    "Hazaribagh", "Giridih", "Ramgarh", "Medininagar", "Chirkunda", "Chaibasa",
    "Jhumri Telaiya", "Gumla", "Dumka", "Sahibganj", "Chatra", "Pakur",
  ],
  "Karnataka": [
    "Bengaluru", "Mysuru", "Hubballi-Dharwad", "Mangaluru", "Belagavi", "Gulbarga",
    "Davanagere", "Ballari", "Vijayapura", "Shivamogga", "Tumakuru", "Raichur",
    "Bidar", "Hospet", "Hassan", "Gadag-Betageri", "Udupi", "Robertsonpet",
    "Bhadravati", "Chitradurga", "Kolar", "Mandya", "Chikkamagaluru", "Gangavathi",
    "Bagalkot", "Ranebennuru", "Karwar",
  ],
  "Kerala": [
    "Thiruvananthapuram", "Kochi", "Kozhikode", "Kollam", "Thrissur", "Alappuzha",
    "Palakkad", "Kannur", "Kottayam", "Malappuram", "Kasaragod", "Pathanamthitta",
    "Idukki", "Ernakulam", "Wayanad", "Manjeri", "Kayamkulam", "Neyyattinkara",
    "Tirur", "Chalakudy", "Changanassery", "Ponnani", "Vatakara",
  ],
  "Madhya Pradesh": [
    "Indore", "Bhopal", "Jabalpur", "Gwalior", "Ujjain", "Sagar",
    "Dewas", "Satna", "Ratlam", "Rewa", "Murwara", "Singrauli",
    "Burhanpur", "Khandwa", "Bhind", "Chhindwara", "Guna", "Shivpuri",
    "Vidisha", "Chhatarpur", "Damoh", "Mandsaur", "Khargone", "Neemuch",
    "Pithampur", "Hoshangabad", "Itarsi", "Sehore", "Morena", "Betul",
  ],
  "Maharashtra": [
    "Mumbai", "Pune", "Nagpur", "Thane", "Nashik", "Aurangabad",
    "Solapur", "Amravati", "Kolhapur", "Vasai-Virar", "Navi Mumbai", "Malegaon",
    "Jalgaon", "Akola", "Latur", "Dhule", "Ahmednagar", "Chandrapur",
    "Parbhani", "Ichalkaranji", "Jalna", "Bhiwandi", "Panvel", "Satara",
    "Beed", "Yavatmal", "Osmanabad", "Nanded", "Wardha", "Sangli",
    "Chakan", "Pimpri-Chinchwad", "Ratnagiri", "Raigad", "Sindhudurg", "Gondia",
  ],
  "Manipur": [
    "Imphal", "Thoubal", "Bishnupur", "Churachandpur", "Kakching", "Ukhrul",
    "Senapati", "Chandel", "Tamenglong", "Jiribam",
  ],
  "Meghalaya": [
    "Shillong", "Tura", "Nongstoin", "Jowai", "Baghmara", "Williamnagar",
    "Nongpoh", "Mairang", "Resubelpara", "Ampati",
  ],
  "Mizoram": [
    "Aizawl", "Lunglei", "Saiha", "Champhai", "Kolasib", "Serchhip",
    "Mamit", "Lawngtlai", "Khawzawl", "Hnahthial",
  ],
  "Nagaland": [
    "Kohima", "Dimapur", "Mokokchung", "Tuensang", "Wokha", "Zunheboto",
    "Phek", "Mon", "Kiphire", "Longleng", "Peren",
  ],
  "Odisha": [
    "Bhubaneswar", "Cuttack", "Rourkela", "Berhampur", "Sambalpur", "Puri",
    "Balasore", "Bhadrak", "Baripada", "Jharsuguda", "Jeypore", "Barbil",
    "Khordha", "Sunabeda", "Rayagada", "Angul", "Dhenkanal", "Paradip",
    "Kendujhar", "Jagatsinghpur", "Byasanagar",
  ],
  "Punjab": [
    "Ludhiana", "Amritsar", "Jalandhar", "Patiala", "Bathinda", "Mohali",
    "Hoshiarpur", "Batala", "Pathankot", "Moga", "Abohar", "Malerkotla",
    "Khanna", "Phagwara", "Muktsar", "Barnala", "Rajpura", "Firozpur",
    "Kapurthala", "Sangrur", "Fazilka", "Gurdaspur", "Kharar",
  ],
  "Rajasthan": [
    "Jaipur", "Jodhpur", "Udaipur", "Kota", "Ajmer", "Bikaner",
    "Bhilwara", "Alwar", "Sikar", "Pali", "Sri Ganganagar", "Tonk",
    "Beawar", "Hanumangarh", "Kishangarh", "Dhaulpur", "Churu", "Banswara",
    "Jhunjhunu", "Barmer", "Sawai Madhopur", "Gangapur City", "Nagaur",
    "Makrana", "Sujangarh", "Dausa", "Nimbahera", "Chittorgarh",
  ],
  "Sikkim": [
    "Gangtok", "Namchi", "Gyalshing", "Mangan", "Jorethang", "Singtam",
    "Rangpo", "Rongli", "Soreng",
  ],
  "Tamil Nadu": [
    "Chennai", "Coimbatore", "Madurai", "Tiruchirappalli", "Salem", "Tirunelveli",
    "Tiruppur", "Vellore", "Erode", "Thoothukudi", "Dindigul", "Thanjavur",
    "Ranipet", "Sivakasi", "Karur", "Udhagamandalam", "Hosur", "Nagercoil",
    "Kanchipuram", "Karaikkudi", "Neyveli", "Cuddalore", "Kumbakonam", "Tiruvannamalai",
    "Pollachi", "Rajapalayam", "Gudiyatham", "Pudukkottai", "Vaniyambadi",
    "Ambur", "Nagapattinam",
  ],
  "Telangana": [
    "Hyderabad", "Warangal", "Nizamabad", "Karimnagar", "Ramagundam", "Khammam",
    "Mahbubnagar", "Nalgonda", "Adilabad", "Suryapet", "Miryalaguda", "Siddipet",
    "Jagtial", "Mancherial", "Kamareddy", "Bhongir", "Vikarabad", "Medak",
    "Sangareddy", "Nagarkurnool", "Bodhan", "Sircilla",
  ],
  "Tripura": [
    "Agartala", "Dharmanagar", "Udaipur", "Kailasahar", "Belonia", "Khowai",
    "Ambassa", "Teliamura", "Sabroom", "Sonamura", "Kumarghat", "Amarpur",
  ],
  "Uttar Pradesh": [
    "Lucknow", "Kanpur", "Ghaziabad", "Agra", "Varanasi", "Meerut",
    "Prayagraj", "Bareilly", "Aligarh", "Moradabad", "Saharanpur", "Gorakhpur",
    "Noida", "Firozabad", "Jhansi", "Muzaffarnagar", "Mathura", "Ayodhya",
    "Rampur", "Shahjahanpur", "Farrukhabad", "Mau", "Hapur", "Etawah",
    "Mirzapur", "Bulandshahr", "Sambhal", "Amroha", "Hardoi", "Fatehpur",
    "Raebareli", "Orai", "Sitapur", "Bahraich", "Unnao", "Jaunpur",
    "Lakhimpur", "Hathras", "Banda", "Pilibhit", "Barabanki", "Khurja",
    "Greater Noida", "Deoria", "Ballia",
  ],
  "Uttarakhand": [
    "Dehradun", "Haridwar", "Roorkee", "Haldwani", "Rudrapur", "Kashipur",
    "Rishikesh", "Kotdwar", "Ramnagar", "Pithoragarh", "Manglaur", "Nainital",
    "Mussoorie", "Tehri", "Almora", "Pauri", "Bageshwar", "Chamoli",
  ],
  "West Bengal": [
    "Kolkata", "Asansol", "Siliguri", "Durgapur", "Bardhaman", "Malda",
    "Baharampur", "Habra", "Kharagpur", "Shantipur", "Dankuni", "Dhulian",
    "Ranaghat", "Haldia", "Raiganj", "Krishnanagar", "Nabadwip", "Medinipur",
    "Jalpaiguri", "Balurghat", "Basirhat", "Bankura", "Chakdaha", "Darjeeling",
    "Alipurduar", "Purulia", "Jangipur", "Bangaon", "Cooch Behar", "Dum Dum",
    "Howrah", "Bidhannagar", "Barrackpore",
  ],
  "Andaman and Nicobar Islands": [
    "Port Blair", "Diglipur", "Mayabunder", "Rangat", "Car Nicobar", "Havelock Island",
    "Hut Bay", "Campbell Bay",
  ],
  "Chandigarh": ["Chandigarh"],
  "Dadra and Nagar Haveli and Daman and Diu": [
    "Daman", "Diu", "Silvassa", "Amli", "Naroli",
  ],
  "Delhi": [
    "New Delhi", "Delhi", "North Delhi", "South Delhi", "East Delhi", "West Delhi",
    "Central Delhi", "North East Delhi", "North West Delhi", "South West Delhi",
    "South East Delhi", "Shahdara", "Dwarka", "Rohini", "Narela", "Najafgarh",
  ],
  "Jammu and Kashmir": [
    "Srinagar", "Jammu", "Anantnag", "Baramulla", "Udhampur", "Kathua",
    "Sopore", "Kupwara", "Pulwama", "Rajouri", "Poonch", "Kulgam",
    "Bandipora", "Ganderbal", "Doda", "Kishtwar", "Ramban", "Reasi", "Samba",
  ],
  "Ladakh": ["Leh", "Kargil", "Nubra", "Zanskar", "Drass", "Diskit"],
  "Lakshadweep": [
    "Kavaratti", "Agatti", "Minicoy", "Andrott", "Amini", "Kadmat", "Kalpeni",
    "Kiltan", "Chetlat",
  ],
  "Puducherry": ["Puducherry", "Karaikal", "Yanam", "Mahe", "Ozhukarai", "Villianur"],
};

/** Get the list of cities for a given state name. Returns empty array if state not found. */
export function citiesForState(stateName: string): string[] {
  if (!stateName) return [];
  return CITIES_BY_STATE[stateName] ?? [];
}

/** Returns true if the given city is listed under the given state. */
export function isCityInState(stateName: string, city: string): boolean {
  if (!stateName || !city) return false;
  return (CITIES_BY_STATE[stateName] ?? []).includes(city);
}

/**
 * Representative PIN code per city.
 *
 * Indian cities span multiple PIN codes (Mumbai has 100+). This map holds ONE
 * common/HQ PIN per major city as a sensible default the user can override if
 * their specific address falls under a different locality. Forms auto-fill
 * this when a city is picked but keep the PIN field editable.
 *
 * Missing entries return empty string → user types the PIN manually.
 */
export const PINCODE_BY_CITY: Record<string, Record<string, string>> = {
  "Andhra Pradesh": {
    "Visakhapatnam": "530001", "Vijayawada": "520001", "Guntur": "522001",
    "Nellore": "524001", "Kurnool": "518001", "Rajahmundry": "533101",
    "Tirupati": "517501", "Kakinada": "533001", "Kadapa": "516001",
    "Anantapur": "515001", "Vizianagaram": "535001", "Eluru": "534001",
    "Ongole": "523001", "Chittoor": "517001", "Srikakulam": "532001",
    "Machilipatnam": "521001", "Tenali": "522201", "Adoni": "518301",
    "Nandyal": "518501", "Bhimavaram": "534201",
  },
  "Arunachal Pradesh": {
    "Itanagar": "791111", "Naharlagun": "791110", "Pasighat": "791102",
    "Tawang": "790104", "Ziro": "791120", "Bomdila": "790001",
    "Tezu": "792001", "Along": "791001", "Roing": "792110", "Khonsa": "792130",
  },
  "Assam": {
    "Guwahati": "781001", "Silchar": "788001", "Dibrugarh": "786001",
    "Jorhat": "785001", "Nagaon": "782001", "Tinsukia": "786125",
    "Tezpur": "784001", "Bongaigaon": "783380", "Dhubri": "783301",
    "North Lakhimpur": "787001", "Karimganj": "788710", "Sivasagar": "785640",
    "Barpeta": "781301", "Diphu": "782460", "Golaghat": "785621",
  },
  "Bihar": {
    "Patna": "800001", "Gaya": "823001", "Bhagalpur": "812001",
    "Muzaffarpur": "842001", "Darbhanga": "846004", "Purnia": "854301",
    "Bihar Sharif": "803101", "Arrah": "802301", "Begusarai": "851101",
    "Katihar": "854105", "Munger": "811201", "Chhapra": "841301",
    "Danapur": "801503", "Bettiah": "845438", "Saharsa": "852201",
    "Hajipur": "844101", "Sasaram": "821115", "Siwan": "841226",
    "Motihari": "845401", "Nawada": "805110", "Buxar": "802101",
    "Kishanganj": "855107", "Sitamarhi": "843302",
  },
  "Chhattisgarh": {
    "Raipur": "492001", "Bhilai": "490001", "Bilaspur": "495001",
    "Korba": "495677", "Durg": "491001", "Rajnandgaon": "491441",
    "Jagdalpur": "494001", "Raigarh": "496001", "Ambikapur": "497001",
    "Mahasamund": "493445", "Dhamtari": "493773",
  },
  "Goa": {
    "Panaji": "403001", "Vasco da Gama": "403802", "Margao": "403601",
    "Mapusa": "403507", "Ponda": "403401", "Bicholim": "403504",
    "Curchorem": "403706", "Sanquelim": "403505", "Cuncolim": "403703",
    "Quepem": "403705", "Canacona": "403702", "Pernem": "403512",
  },
  "Gujarat": {
    "Ahmedabad": "380001", "Surat": "395001", "Vadodara": "390001",
    "Rajkot": "360001", "Bhavnagar": "364001", "Jamnagar": "361001",
    "Junagadh": "362001", "Gandhinagar": "382010", "Anand": "388001",
    "Navsari": "396445", "Morbi": "363641", "Nadiad": "387001",
    "Surendranagar": "363001", "Bharuch": "392001", "Mehsana": "384001",
    "Gandhidham": "370201", "Porbandar": "360575", "Vapi": "396191",
    "Palanpur": "385001", "Valsad": "396001", "Veraval": "362265",
    "Godhra": "389001", "Bhuj": "370001", "Ankleshwar": "393001",
  },
  "Haryana": {
    "Faridabad": "121001", "Gurugram": "122001", "Panipat": "132103",
    "Ambala": "134003", "Yamunanagar": "135001", "Rohtak": "124001",
    "Hisar": "125001", "Karnal": "132001", "Sonipat": "131001",
    "Panchkula": "134109", "Bhiwani": "127021", "Sirsa": "125055",
    "Bahadurgarh": "124507", "Jind": "126102", "Thanesar": "136118",
    "Kaithal": "136027", "Rewari": "123401", "Palwal": "121102",
    "Hansi": "125033", "Narnaul": "123001", "Fatehabad": "125050",
  },
  "Himachal Pradesh": {
    "Shimla": "171001", "Dharamshala": "176215", "Solan": "173212",
    "Mandi": "175001", "Palampur": "176061", "Kullu": "175101",
    "Hamirpur": "177001", "Una": "174303", "Nahan": "173001",
    "Bilaspur": "174001", "Chamba": "176310", "Kangra": "176001",
    "Baddi": "173205", "Manali": "175131", "Sundarnagar": "175019",
    "Paonta Sahib": "173025",
  },
  "Jharkhand": {
    "Ranchi": "834001", "Jamshedpur": "831001", "Dhanbad": "826001",
    "Bokaro Steel City": "827001", "Deoghar": "814112", "Hazaribagh": "825301",
    "Giridih": "815301", "Ramgarh": "829122", "Medininagar": "822101",
    "Chaibasa": "833201", "Gumla": "835207", "Dumka": "814101",
    "Sahibganj": "816109", "Chatra": "825401", "Pakur": "816107",
  },
  "Karnataka": {
    "Bengaluru": "560001", "Mysuru": "570001", "Hubballi-Dharwad": "580020",
    "Mangaluru": "575001", "Belagavi": "590001", "Gulbarga": "585101",
    "Davanagere": "577001", "Ballari": "583101", "Vijayapura": "586101",
    "Shivamogga": "577201", "Tumakuru": "572101", "Raichur": "584101",
    "Bidar": "585401", "Hospet": "583201", "Hassan": "573201",
    "Udupi": "576101", "Robertsonpet": "563122", "Bhadravati": "577301",
    "Chitradurga": "577501", "Kolar": "563101", "Mandya": "571401",
    "Chikkamagaluru": "577101", "Bagalkot": "587101", "Karwar": "581301",
  },
  "Kerala": {
    "Thiruvananthapuram": "695001", "Kochi": "682001", "Kozhikode": "673001",
    "Kollam": "691001", "Thrissur": "680001", "Alappuzha": "688001",
    "Palakkad": "678001", "Kannur": "670001", "Kottayam": "686001",
    "Malappuram": "676505", "Kasaragod": "671121", "Pathanamthitta": "689645",
    "Idukki": "685602", "Ernakulam": "682011", "Wayanad": "673121",
    "Manjeri": "676121", "Tirur": "676101", "Chalakudy": "680307",
    "Changanassery": "686101", "Ponnani": "679577",
  },
  "Madhya Pradesh": {
    "Indore": "452001", "Bhopal": "462001", "Jabalpur": "482001",
    "Gwalior": "474001", "Ujjain": "456001", "Sagar": "470001",
    "Dewas": "455001", "Satna": "485001", "Ratlam": "457001",
    "Rewa": "486001", "Murwara": "483501", "Singrauli": "486889",
    "Burhanpur": "450331", "Khandwa": "450001", "Bhind": "477001",
    "Chhindwara": "480001", "Guna": "473001", "Shivpuri": "473551",
    "Vidisha": "464001", "Chhatarpur": "471001", "Damoh": "470661",
    "Mandsaur": "458001", "Khargone": "451001", "Neemuch": "458441",
    "Pithampur": "454775", "Hoshangabad": "461001", "Itarsi": "461111",
    "Sehore": "466001", "Morena": "476001", "Betul": "460001",
  },
  "Maharashtra": {
    "Mumbai": "400001", "Pune": "411001", "Nagpur": "440001",
    "Thane": "400601", "Nashik": "422001", "Aurangabad": "431001",
    "Solapur": "413001", "Amravati": "444601", "Kolhapur": "416001",
    "Vasai-Virar": "401201", "Navi Mumbai": "400614", "Malegaon": "423203",
    "Jalgaon": "425001", "Akola": "444001", "Latur": "413512",
    "Dhule": "424001", "Ahmednagar": "414001", "Chandrapur": "442401",
    "Parbhani": "431401", "Ichalkaranji": "416115", "Jalna": "431203",
    "Bhiwandi": "421302", "Panvel": "410206", "Satara": "415001",
    "Beed": "431122", "Yavatmal": "445001", "Osmanabad": "413501",
    "Nanded": "431601", "Wardha": "442001", "Sangli": "416416",
    "Chakan": "410501", "Pimpri-Chinchwad": "411018", "Ratnagiri": "415612",
    "Gondia": "441601",
  },
  "Manipur": {
    "Imphal": "795001", "Thoubal": "795138", "Bishnupur": "795126",
    "Churachandpur": "795128", "Ukhrul": "795142", "Senapati": "795106",
  },
  "Meghalaya": {
    "Shillong": "793001", "Tura": "794001", "Jowai": "793150",
    "Nongstoin": "793119", "Baghmara": "794102", "Williamnagar": "794111",
  },
  "Mizoram": {
    "Aizawl": "796001", "Lunglei": "796701", "Saiha": "796901",
    "Champhai": "796321", "Kolasib": "796081", "Serchhip": "796181",
  },
  "Nagaland": {
    "Kohima": "797001", "Dimapur": "797112", "Mokokchung": "798601",
    "Tuensang": "798612", "Wokha": "797111", "Zunheboto": "798620",
    "Phek": "797108", "Mon": "798621",
  },
  "Odisha": {
    "Bhubaneswar": "751001", "Cuttack": "753001", "Rourkela": "769001",
    "Berhampur": "760001", "Sambalpur": "768001", "Puri": "752001",
    "Balasore": "756001", "Bhadrak": "756100", "Baripada": "757001",
    "Jharsuguda": "768201", "Jeypore": "764001", "Barbil": "758035",
    "Khordha": "752055", "Rayagada": "765001", "Angul": "759122",
    "Dhenkanal": "759001", "Paradip": "754142", "Kendujhar": "758001",
    "Jagatsinghpur": "754103",
  },
  "Punjab": {
    "Ludhiana": "141001", "Amritsar": "143001", "Jalandhar": "144001",
    "Patiala": "147001", "Bathinda": "151001", "Mohali": "160055",
    "Hoshiarpur": "146001", "Batala": "143505", "Pathankot": "145001",
    "Moga": "142001", "Abohar": "152116", "Malerkotla": "148023",
    "Khanna": "141401", "Phagwara": "144401", "Muktsar": "152026",
    "Barnala": "148101", "Rajpura": "140401", "Firozpur": "152002",
    "Kapurthala": "144601", "Sangrur": "148001", "Fazilka": "152123",
    "Gurdaspur": "143521", "Kharar": "140301",
  },
  "Rajasthan": {
    "Jaipur": "302001", "Jodhpur": "342001", "Udaipur": "313001",
    "Kota": "324001", "Ajmer": "305001", "Bikaner": "334001",
    "Bhilwara": "311001", "Alwar": "301001", "Sikar": "332001",
    "Pali": "306401", "Sri Ganganagar": "335001", "Tonk": "304001",
    "Beawar": "305901", "Hanumangarh": "335513", "Kishangarh": "305801",
    "Dhaulpur": "328001", "Churu": "331001", "Banswara": "327001",
    "Jhunjhunu": "333001", "Barmer": "344001", "Sawai Madhopur": "322001",
    "Nagaur": "341001", "Makrana": "341505", "Dausa": "303303",
    "Chittorgarh": "312001",
  },
  "Sikkim": {
    "Gangtok": "737101", "Namchi": "737126", "Gyalshing": "737111",
    "Mangan": "737116", "Jorethang": "737121", "Singtam": "737134",
    "Rangpo": "737132",
  },
  "Tamil Nadu": {
    "Chennai": "600001", "Coimbatore": "641001", "Madurai": "625001",
    "Tiruchirappalli": "620001", "Salem": "636001", "Tirunelveli": "627001",
    "Tiruppur": "641601", "Vellore": "632001", "Erode": "638001",
    "Thoothukudi": "628001", "Dindigul": "624001", "Thanjavur": "613001",
    "Ranipet": "632401", "Sivakasi": "626123", "Karur": "639001",
    "Udhagamandalam": "643001", "Hosur": "635109", "Nagercoil": "629001",
    "Kanchipuram": "631501", "Karaikkudi": "630001", "Neyveli": "607801",
    "Cuddalore": "607001", "Kumbakonam": "612001", "Tiruvannamalai": "606601",
    "Pollachi": "642001", "Rajapalayam": "626117", "Pudukkottai": "622001",
    "Ambur": "635802", "Nagapattinam": "611001",
  },
  "Telangana": {
    "Hyderabad": "500001", "Warangal": "506001", "Nizamabad": "503001",
    "Karimnagar": "505001", "Ramagundam": "505208", "Khammam": "507001",
    "Mahbubnagar": "509001", "Nalgonda": "508001", "Adilabad": "504001",
    "Suryapet": "508213", "Miryalaguda": "508207", "Siddipet": "502103",
    "Jagtial": "505327", "Mancherial": "504208", "Kamareddy": "503111",
    "Bhongir": "508116", "Vikarabad": "501101", "Medak": "502110",
    "Sangareddy": "502001", "Bodhan": "503180",
  },
  "Tripura": {
    "Agartala": "799001", "Dharmanagar": "799250", "Udaipur": "799120",
    "Kailasahar": "799277", "Belonia": "799155", "Khowai": "799201",
    "Ambassa": "799289", "Teliamura": "799205", "Sabroom": "799145",
  },
  "Uttar Pradesh": {
    "Lucknow": "226001", "Kanpur": "208001", "Ghaziabad": "201001",
    "Agra": "282001", "Varanasi": "221001", "Meerut": "250001",
    "Prayagraj": "211001", "Bareilly": "243001", "Aligarh": "202001",
    "Moradabad": "244001", "Saharanpur": "247001", "Gorakhpur": "273001",
    "Noida": "201301", "Firozabad": "283203", "Jhansi": "284001",
    "Muzaffarnagar": "251001", "Mathura": "281001", "Ayodhya": "224001",
    "Rampur": "244901", "Shahjahanpur": "242001", "Farrukhabad": "209625",
    "Mau": "275101", "Hapur": "245101", "Etawah": "206001",
    "Mirzapur": "231001", "Bulandshahr": "203001", "Sambhal": "244302",
    "Amroha": "244221", "Hardoi": "241001", "Fatehpur": "212601",
    "Raebareli": "229001", "Orai": "285001", "Sitapur": "261001",
    "Bahraich": "271801", "Unnao": "209801", "Jaunpur": "222001",
    "Lakhimpur": "262701", "Hathras": "204101", "Banda": "210001",
    "Pilibhit": "262001", "Barabanki": "225001", "Khurja": "203131",
    "Greater Noida": "201310", "Deoria": "274001", "Ballia": "277001",
  },
  "Uttarakhand": {
    "Dehradun": "248001", "Haridwar": "249401", "Roorkee": "247667",
    "Haldwani": "263139", "Rudrapur": "263153", "Kashipur": "244713",
    "Rishikesh": "249201", "Kotdwar": "246149", "Ramnagar": "244715",
    "Pithoragarh": "262501", "Nainital": "263001", "Mussoorie": "248179",
    "Almora": "263601", "Pauri": "246001",
  },
  "West Bengal": {
    "Kolkata": "700001", "Asansol": "713301", "Siliguri": "734001",
    "Durgapur": "713201", "Bardhaman": "713101", "Malda": "732101",
    "Baharampur": "742101", "Habra": "743263", "Kharagpur": "721301",
    "Shantipur": "741404", "Ranaghat": "741201", "Haldia": "721657",
    "Raiganj": "733134", "Krishnanagar": "741101", "Nabadwip": "741302",
    "Medinipur": "721101", "Jalpaiguri": "735101", "Balurghat": "733101",
    "Basirhat": "743411", "Bankura": "722101", "Darjeeling": "734101",
    "Alipurduar": "736121", "Purulia": "723101", "Bangaon": "743235",
    "Cooch Behar": "736101", "Dum Dum": "700028", "Howrah": "711101",
    "Bidhannagar": "700064", "Barrackpore": "700120",
  },
  "Andaman and Nicobar Islands": {
    "Port Blair": "744101", "Diglipur": "744202", "Mayabunder": "744204",
    "Rangat": "744205", "Car Nicobar": "744301", "Havelock Island": "744211",
    "Hut Bay": "744207",
  },
  "Chandigarh": { "Chandigarh": "160001" },
  "Dadra and Nagar Haveli and Daman and Diu": {
    "Daman": "396210", "Diu": "362520", "Silvassa": "396230",
    "Amli": "396230", "Naroli": "396235",
  },
  "Delhi": {
    "New Delhi": "110001", "Delhi": "110006", "North Delhi": "110054",
    "South Delhi": "110017", "East Delhi": "110092", "West Delhi": "110018",
    "Central Delhi": "110001", "North East Delhi": "110032",
    "North West Delhi": "110085", "South West Delhi": "110045",
    "South East Delhi": "110025", "Shahdara": "110032", "Dwarka": "110075",
    "Rohini": "110085", "Narela": "110040", "Najafgarh": "110043",
  },
  "Jammu and Kashmir": {
    "Srinagar": "190001", "Jammu": "180001", "Anantnag": "192101",
    "Baramulla": "193101", "Udhampur": "182101", "Kathua": "184101",
    "Sopore": "193201", "Kupwara": "193222", "Pulwama": "192301",
    "Rajouri": "185131", "Poonch": "185101", "Kulgam": "192231",
    "Bandipora": "193502", "Ganderbal": "191201", "Doda": "182202",
    "Kishtwar": "182204", "Ramban": "182144", "Reasi": "182311",
    "Samba": "184121",
  },
  "Ladakh": {
    "Leh": "194101", "Kargil": "194103", "Drass": "194102",
    "Diskit": "194401",
  },
  "Lakshadweep": {
    "Kavaratti": "682555", "Agatti": "682553", "Minicoy": "682559",
    "Andrott": "682551", "Amini": "682552", "Kadmat": "682557",
    "Kalpeni": "682554", "Kiltan": "682558", "Chetlat": "682556",
  },
  "Puducherry": {
    "Puducherry": "605001", "Karaikal": "609602", "Yanam": "533464",
    "Mahe": "673310", "Ozhukarai": "605008", "Villianur": "605110",
  },
};

/**
 * Default PIN code for a given state + city.
 * Returns empty string if we don't have a mapping — caller should leave the
 * field for the user to type manually in that case.
 */
export function defaultPincodeFor(stateName: string, city: string): string {
  if (!stateName || !city) return "";
  return PINCODE_BY_CITY[stateName]?.[city] ?? "";
}
