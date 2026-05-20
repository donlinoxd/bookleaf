import { db } from './index'
import {
  borrowingRecords, fines, gateLogs, institutions,
  reservations, resourceCopies, resources, scanEntries, scanSessions, users,
} from './schema'
import { hashPin } from './database'

function daysAgo(n: number): string {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return d.toISOString().slice(0, 19).replace('T', ' ')
}

function daysFromNow(n: number): string {
  const d = new Date()
  d.setDate(d.getDate() + n)
  return d.toISOString().slice(0, 19).replace('T', ' ')
}

export async function seedDummyData(): Promise<void> {
  // All demo accounts use PIN 1234. Hashed lazily so the module is
  // import-safe (hashPin needs crypto.getRandomValues, which is only
  // polyfilled after the root layout loads).
  const PIN_1234 = hashPin('1234')

  // ── Institution ─────────────────────────────────────────────────────────────
  const [inst] = await db.insert(institutions).values({
    name: 'St. Thomas Aquinas College',
    address: '123 College Road, Lipa City, Batangas',
  }).returning({ id: institutions.id })
  const iid = inst.id

  // ── Users ───────────────────────────────────────────────────────────────────
  const U = await db.insert(users).values([
    { institution_id: iid, name: 'Admin User',        id_number: 'ADM-001',       role: 'admin',     pin_hash: PIN_1234 },
    { institution_id: iid, name: 'Rosa Dela Cruz',    id_number: 'LIB-001',       role: 'librarian', pin_hash: PIN_1234, department: 'Library Services' },
    { institution_id: iid, name: 'Pedro Reyes',       id_number: 'LIB-002',       role: 'librarian', pin_hash: PIN_1234, department: 'Library Services' },
    { institution_id: iid, name: 'Maria Santos',      id_number: 'STU-2024-001',  role: 'member',    pin_hash: PIN_1234, user_type: 'student',  department: 'Computer Science' },
    { institution_id: iid, name: 'Juan dela Cruz',    id_number: 'STU-2024-002',  role: 'member',    pin_hash: PIN_1234, user_type: 'student',  department: 'Computer Science' },
    { institution_id: iid, name: 'Liezl Cadiog',      id_number: 'STU-2024-003',  role: 'member',    pin_hash: PIN_1234, user_type: 'student',  department: 'Nursing' },
    { institution_id: iid, name: 'Jose Ramos',        id_number: 'STU-2024-004',  role: 'member',    pin_hash: PIN_1234, user_type: 'student',  department: 'Engineering' },
    { institution_id: iid, name: 'Ana Macaraeg',      id_number: 'STU-2024-005',  role: 'member',    pin_hash: PIN_1234, user_type: 'student',  department: 'Business Administration' },
    { institution_id: iid, name: 'Carlos Fernandez',  id_number: 'STU-2024-006',  role: 'member',    pin_hash: PIN_1234, user_type: 'student',  department: 'Criminal Justice' },
    { institution_id: iid, name: 'Sofia Mendoza',     id_number: 'STU-2024-007',  role: 'member',    pin_hash: PIN_1234, user_type: 'student',  department: 'Education' },
    { institution_id: iid, name: 'Marco Villanueva',  id_number: 'STU-2024-008',  role: 'member',    pin_hash: PIN_1234, user_type: 'student',  department: 'Information Technology' },
    { institution_id: iid, name: 'Dr. Elena Bautista',id_number: 'FAC-001',       role: 'member',    pin_hash: PIN_1234, user_type: 'faculty',  department: 'Computer Science' },
    { institution_id: iid, name: 'Prof. Ricardo Lim', id_number: 'FAC-002',       role: 'member',    pin_hash: PIN_1234, user_type: 'faculty',  department: 'Engineering' },
    { institution_id: iid, name: 'Dr. Grace Tan',     id_number: 'FAC-003',       role: 'member',    pin_hash: PIN_1234, user_type: 'faculty',  department: 'Nursing' },
    { institution_id: iid, name: 'Prof. Andres Castro',id_number: 'FAC-004',      role: 'member',    pin_hash: PIN_1234, user_type: 'faculty',  department: 'Business Administration' },
    { institution_id: iid, name: 'Miguel Torres',     id_number: 'ALU-2022-001',  role: 'member',    pin_hash: PIN_1234, user_type: 'alumni',   department: 'Computer Science' },
    { institution_id: iid, name: 'Isabella Garcia',   id_number: 'ALU-2021-001',  role: 'member',    pin_hash: PIN_1234, user_type: 'alumni',   department: 'Business Administration' },
    { institution_id: iid, name: 'Roberto Aquino',    id_number: 'EXT-001',       role: 'member',    pin_hash: PIN_1234, user_type: 'external' },
    { institution_id: iid, name: 'Alma Pascual',      id_number: 'STU-2023-099',  role: 'member',    pin_hash: PIN_1234, user_type: 'student',  department: 'Nursing', is_active: false },
  ]).returning({ id: users.id })

  const [
    , , ,
    maria, juan, liezl, jose, ana, carlos, sofia, marco,
    drElena, profRicardo, , profAndres,
    miguel, isabella, roberto,
  ] = U.map(u => u.id)

  // ── Resources ───────────────────────────────────────────────────────────────
  // available_copies accounts for the borrows/reservations created below
  const R = await db.insert(resources).values([
    { institution_id: iid, title: 'Introduction to Algorithms',                  author: 'Thomas H. Cormen',               isbn: '9780262033848', publisher: 'MIT Press',          year: 2022, genre: 'computer science',    material_type: 'BOOK',   call_number: 'QA76.9.A43 C67',  call_number_type: 'LC', total_copies: 3, available_copies: 2, subject_headings: 'algorithms; data structures' },
    { institution_id: iid, title: 'Artificial Intelligence: A Modern Approach',  author: 'Stuart J. Russell',              isbn: '9780134610993', publisher: 'Pearson',            year: 2020, genre: 'artificial intelligence', material_type: 'BOOK', call_number: 'Q335 .R86',       call_number_type: 'LC', total_copies: 2, available_copies: 1, subject_headings: 'artificial intelligence; machine learning' },
    { institution_id: iid, title: 'Clean Code',                                  author: 'Robert C. Martin',               isbn: '9780132350884', publisher: 'Prentice Hall',      year: 2008, genre: 'software engineering', material_type: 'BOOK',   call_number: 'QA76.73.J38 M37', call_number_type: 'LC', total_copies: 2, available_copies: 2, subject_headings: 'software development; best practices' },
    { institution_id: iid, title: 'Fundamentals of Database Systems',            author: 'Ramez Elmasri',                  isbn: '9780133970777', publisher: 'Pearson',            year: 2015, genre: 'database',            material_type: 'BOOK',   call_number: 'QA76.9.D3 E57',   call_number_type: 'LC', total_copies: 2, available_copies: 1, subject_headings: 'database management; SQL' },
    { institution_id: iid, title: 'Network Security Essentials',                 author: 'William Stallings',              isbn: '9780134527338', publisher: 'Pearson',            year: 2016, genre: 'network security',    material_type: 'BOOK',   call_number: 'TK5105.59 .S73',  call_number_type: 'LC', total_copies: 2, available_copies: 1, subject_headings: 'network security; cryptography' },
    { institution_id: iid, title: 'The Great Gatsby',                            author: 'F. Scott Fitzgerald',            isbn: '9780743273565', publisher: 'Scribner',           year: 1925, genre: 'fiction',            material_type: 'BOOK',   call_number: 'PS3511.I9 G7',    call_number_type: 'LC', total_copies: 3, available_copies: 2, subject_headings: 'American fiction; Jazz Age' },
    { institution_id: iid, title: 'To Kill a Mockingbird',                       author: 'Harper Lee',                     isbn: '9780061935466', publisher: 'Harper Perennial',  year: 1960, genre: 'fiction',            material_type: 'BOOK',   call_number: 'PS3562.E353 T6',  call_number_type: 'LC', total_copies: 2, available_copies: 2, subject_headings: 'American fiction; racial justice' },
    { institution_id: iid, title: 'The Art of War',                              author: 'Sun Tzu',                        isbn: '9781599869773', publisher: 'Cosimo Classics',    year: 500,  genre: 'philosophy',          material_type: 'BOOK',   call_number: 'U101 .S95',       call_number_type: 'LC', total_copies: 3, available_copies: 1, subject_headings: 'military strategy; leadership' },
    { institution_id: iid, title: 'Organic Chemistry',                           author: 'Paula Yurkanis Bruice',          isbn: '9780134042282', publisher: 'Pearson',            year: 2016, genre: 'chemistry',           material_type: 'BOOK',   call_number: 'QD251.3 .B78',    call_number_type: 'LC', total_copies: 3, available_copies: 2, subject_headings: 'organic chemistry; reactions' },
    { institution_id: iid, title: 'Calculus: Early Transcendentals',             author: 'James Stewart',                  isbn: '9781285741550', publisher: 'Cengage',            year: 2015, genre: 'mathematics',         material_type: 'BOOK',   call_number: 'QA303.2 .S75',    call_number_type: 'LC', total_copies: 3, available_copies: 2, subject_headings: 'calculus; differential equations' },
    { institution_id: iid, title: 'Fundamentals of Nursing',                     author: 'Barbara Kozier',                 isbn: '9780133974553', publisher: 'Pearson',            year: 2015, genre: 'nursing',            material_type: 'BOOK',   call_number: 'RT41 .K69',       call_number_type: 'LC', total_copies: 3, available_copies: 2, subject_headings: 'nursing; patient care' },
    { institution_id: iid, title: 'Psychology: Core Concepts',                   author: 'Philip Zimbardo',                isbn: '9780205183463', publisher: 'Pearson',            year: 2012, genre: 'psychology',          material_type: 'BOOK',   call_number: 'BF121 .Z56',      call_number_type: 'LC', total_copies: 2, available_copies: 1, subject_headings: 'psychology; behavior; cognition' },
    { institution_id: iid, title: 'Research Methods in Education',               author: 'Louis Cohen',                    isbn: '9781138209886', publisher: 'Routledge',          year: 2018, genre: 'education',           material_type: 'BOOK',   call_number: 'LB1028 .C63',     call_number_type: 'LC', total_copies: 2, available_copies: 1, subject_headings: 'research methods; qualitative research' },
    { institution_id: iid, title: 'History of the Filipino People',              author: 'Teodoro A. Agoncillo',           isbn: '9789715421430', publisher: 'Garotech Publishing',year: 1990, genre: 'history',            material_type: 'BOOK',   call_number: 'DS668 .A36',      call_number_type: 'LC', total_copies: 2, available_copies: 1, subject_headings: 'Philippine history; colonialism' },
    { institution_id: iid, title: 'Philippine Literature: A History and Anthology', author: 'Bienvenido Santos',           isbn: '9789715423014', publisher: 'Bookmark Inc.',      year: 1995, genre: 'literature',          material_type: 'BOOK',   call_number: 'PL5956 .S36',     call_number_type: 'LC', total_copies: 2, available_copies: 2, subject_headings: 'Philippine literature; poetry' },
    { institution_id: iid, title: 'Business Communication Today',                author: 'Courtland Bovee',                isbn: '9780134642376', publisher: 'Pearson',            year: 2018, genre: 'business',            material_type: 'BOOK',   call_number: 'HF5718 .B68',     call_number_type: 'LC', total_copies: 2, available_copies: 2, subject_headings: 'business communication; professional writing' },
    { institution_id: iid, title: 'The Revised Penal Code of the Philippines',   author: 'Luis B. Reyes',                  isbn: '9789712316586', publisher: 'Rex Bookstore',      year: 2012, genre: 'law',                material_type: 'BOOK',   call_number: 'KPM3800 .R49',    call_number_type: 'LC', total_copies: 2, available_copies: 2, subject_headings: 'Philippine law; criminal law' },
    { institution_id: iid, title: 'Impact of E-Learning on Academic Performance',author: 'Maria Santos',                                         publisher: 'St. Thomas Aquinas College', year: 2023, genre: 'thesis',      material_type: 'THESIS', call_number: 'THESIS-2023-001',                         total_copies: 1, available_copies: 1, is_loanable: false, subject_headings: 'e-learning; academic performance' },
    { institution_id: iid, title: 'Blockchain Technology in Library Systems',    author: 'Marco Villanueva',                                     publisher: 'St. Thomas Aquinas College', year: 2024, genre: 'thesis',      material_type: 'THESIS', call_number: 'THESIS-2024-001',                         total_copies: 1, available_copies: 1, is_loanable: false, subject_headings: 'blockchain; library systems' },
    { institution_id: iid, title: 'Philippine Journal of Science',               author: 'Dept. of Science and Technology',issn: '0031-7683',    publisher: 'DOST',               year: 2024, genre: 'science journal',    material_type: 'SERIAL', call_number: 'Q1 .P45',         call_number_type: 'LC', total_copies: 2, available_copies: 2, is_loanable: false, subject_headings: 'science; research; Philippines' },
  ]).returning({ id: resources.id })

  const [
    rAlgo, rAI, rClean, rDB, rNetSec,
    rGatsby, , rSunTzu,
    rOrgChem, rCalc,
    rNursing, rPsych, rResearch,
    rPhilHist, rPhilLit,
    rBizComm, rLaw,
    rThesis1, rThesis2, rJournal,
  ] = R.map(r => r.id)

  // ── Resource Copies ─────────────────────────────────────────────────────────
  const C = await db.insert(resourceCopies).values([
    // Algorithms (3 copies — copy1 borrowed)
    { resource_id: rAlgo,    copy_number: 1, status: 'borrowed',   condition: 'good',    barcode: 'BC-ALGO-001', accession_number: 'ACC-001', shelf_location: 'CS-A1' },
    { resource_id: rAlgo,    copy_number: 2, status: 'available',  condition: 'good',    barcode: 'BC-ALGO-002', accession_number: 'ACC-002', shelf_location: 'CS-A1' },
    { resource_id: rAlgo,    copy_number: 3, status: 'available',  condition: 'damaged', barcode: 'BC-ALGO-003', accession_number: 'ACC-003', shelf_location: 'CS-A1' },
    // AI (2 — copy1 borrowed)
    { resource_id: rAI,      copy_number: 1, status: 'borrowed',   condition: 'good',    barcode: 'BC-AI-001',   accession_number: 'ACC-004', shelf_location: 'CS-A2' },
    { resource_id: rAI,      copy_number: 2, status: 'available',  condition: 'good',    barcode: 'BC-AI-002',   accession_number: 'ACC-005', shelf_location: 'CS-A2' },
    // Clean Code (2 — all available)
    { resource_id: rClean,   copy_number: 1, status: 'available',  condition: 'good',    barcode: 'BC-CLN-001',  accession_number: 'ACC-006', shelf_location: 'CS-A3' },
    { resource_id: rClean,   copy_number: 2, status: 'available',  condition: 'good',    barcode: 'BC-CLN-002',  accession_number: 'ACC-007', shelf_location: 'CS-A3' },
    // Database (2 — copy1 borrowed)
    { resource_id: rDB,      copy_number: 1, status: 'borrowed',   condition: 'good',    barcode: 'BC-DB-001',   accession_number: 'ACC-008', shelf_location: 'CS-B1' },
    { resource_id: rDB,      copy_number: 2, status: 'available',  condition: 'good',    barcode: 'BC-DB-002',   accession_number: 'ACC-009', shelf_location: 'CS-B1' },
    // Network Security (2 — copy2 reserved)
    { resource_id: rNetSec,  copy_number: 1, status: 'available',  condition: 'good',    barcode: 'BC-NET-001',  accession_number: 'ACC-010', shelf_location: 'CS-B2' },
    { resource_id: rNetSec,  copy_number: 2, status: 'reserved',   condition: 'good',    barcode: 'BC-NET-002',  accession_number: 'ACC-011', shelf_location: 'CS-B2' },
    // Gatsby (3 — copy1 overdue)
    { resource_id: rGatsby,  copy_number: 1, status: 'borrowed',   condition: 'good',    barcode: 'BC-GAT-001',  accession_number: 'ACC-012', shelf_location: 'LIT-A1' },
    { resource_id: rGatsby,  copy_number: 2, status: 'available',  condition: 'good',    barcode: 'BC-GAT-002',  accession_number: 'ACC-013', shelf_location: 'LIT-A1' },
    { resource_id: rGatsby,  copy_number: 3, status: 'available',  condition: 'good',    barcode: 'BC-GAT-003',  accession_number: 'ACC-014', shelf_location: 'LIT-A1' },
    // Art of War (3 — copy1 active, copy2 overdue)
    { resource_id: rSunTzu,  copy_number: 1, status: 'borrowed',   condition: 'good',    barcode: 'BC-SUN-001',  accession_number: 'ACC-015', shelf_location: 'PHI-A1' },
    { resource_id: rSunTzu,  copy_number: 2, status: 'borrowed',   condition: 'good',    barcode: 'BC-SUN-002',  accession_number: 'ACC-016', shelf_location: 'PHI-A1' },
    { resource_id: rSunTzu,  copy_number: 3, status: 'available',  condition: 'good',    barcode: 'BC-SUN-003',  accession_number: 'ACC-017', shelf_location: 'PHI-A1' },
    // Organic Chem (3 — copy1 borrowed)
    { resource_id: rOrgChem, copy_number: 1, status: 'borrowed',   condition: 'good',    barcode: 'BC-CHE-001',  accession_number: 'ACC-018', shelf_location: 'SCI-A1' },
    { resource_id: rOrgChem, copy_number: 2, status: 'available',  condition: 'good',    barcode: 'BC-CHE-002',  accession_number: 'ACC-019', shelf_location: 'SCI-A1' },
    { resource_id: rOrgChem, copy_number: 3, status: 'available',  condition: 'good',    barcode: 'BC-CHE-003',  accession_number: 'ACC-020', shelf_location: 'SCI-A1' },
    // Calculus (3 — copy1 overdue)
    { resource_id: rCalc,    copy_number: 1, status: 'borrowed',   condition: 'good',    barcode: 'BC-CAL-001',  accession_number: 'ACC-021', shelf_location: 'SCI-A2' },
    { resource_id: rCalc,    copy_number: 2, status: 'available',  condition: 'good',    barcode: 'BC-CAL-002',  accession_number: 'ACC-022', shelf_location: 'SCI-A2' },
    { resource_id: rCalc,    copy_number: 3, status: 'available',  condition: 'good',    barcode: 'BC-CAL-003',  accession_number: 'ACC-023', shelf_location: 'SCI-A2' },
    // Nursing (3 — copy1 borrowed)
    { resource_id: rNursing, copy_number: 1, status: 'borrowed',   condition: 'good',    barcode: 'BC-NUR-001',  accession_number: 'ACC-024', shelf_location: 'HLT-A1' },
    { resource_id: rNursing, copy_number: 2, status: 'available',  condition: 'good',    barcode: 'BC-NUR-002',  accession_number: 'ACC-025', shelf_location: 'HLT-A1' },
    { resource_id: rNursing, copy_number: 3, status: 'available',  condition: 'good',    barcode: 'BC-NUR-003',  accession_number: 'ACC-026', shelf_location: 'HLT-A1' },
    // Psychology (2 — copy1 borrowed)
    { resource_id: rPsych,   copy_number: 1, status: 'borrowed',   condition: 'good',    barcode: 'BC-PSY-001',  accession_number: 'ACC-027', shelf_location: 'SOC-A1' },
    { resource_id: rPsych,   copy_number: 2, status: 'available',  condition: 'good',    barcode: 'BC-PSY-002',  accession_number: 'ACC-028', shelf_location: 'SOC-A1' },
    // Research Methods (2 — copy1 borrowed)
    { resource_id: rResearch,copy_number: 1, status: 'borrowed',   condition: 'good',    barcode: 'BC-RES-001',  accession_number: 'ACC-029', shelf_location: 'EDU-A1' },
    { resource_id: rResearch,copy_number: 2, status: 'available',  condition: 'good',    barcode: 'BC-RES-002',  accession_number: 'ACC-030', shelf_location: 'EDU-A1' },
    // Phil History (2 — copy2 reserved)
    { resource_id: rPhilHist,copy_number: 1, status: 'available',  condition: 'good',    barcode: 'BC-PHH-001',  accession_number: 'ACC-031', shelf_location: 'PHI-B1' },
    { resource_id: rPhilHist,copy_number: 2, status: 'reserved',   condition: 'good',    barcode: 'BC-PHH-002',  accession_number: 'ACC-032', shelf_location: 'PHI-B1' },
    // Phil Lit (2 — all available)
    { resource_id: rPhilLit, copy_number: 1, status: 'available',  condition: 'good',    barcode: 'BC-PHL-001',  accession_number: 'ACC-033', shelf_location: 'LIT-B1' },
    { resource_id: rPhilLit, copy_number: 2, status: 'available',  condition: 'good',    barcode: 'BC-PHL-002',  accession_number: 'ACC-034', shelf_location: 'LIT-B1' },
    // Biz Comm (2)
    { resource_id: rBizComm, copy_number: 1, status: 'available',  condition: 'good',    barcode: 'BC-BIZ-001',  accession_number: 'ACC-035', shelf_location: 'BUS-A1' },
    { resource_id: rBizComm, copy_number: 2, status: 'available',  condition: 'damaged', barcode: 'BC-BIZ-002',  accession_number: 'ACC-036', shelf_location: 'BUS-A1' },
    // Law (2)
    { resource_id: rLaw,     copy_number: 1, status: 'available',  condition: 'good',    barcode: 'BC-LAW-001',  accession_number: 'ACC-037', shelf_location: 'LAW-A1' },
    { resource_id: rLaw,     copy_number: 2, status: 'available',  condition: 'good',    barcode: 'BC-LAW-002',  accession_number: 'ACC-038', shelf_location: 'LAW-A1' },
    // Theses
    { resource_id: rThesis1, copy_number: 1, status: 'available',  condition: 'good',    accession_number: 'THESIS-2023-001', shelf_location: 'THE-A1' },
    { resource_id: rThesis2, copy_number: 1, status: 'available',  condition: 'good',    accession_number: 'THESIS-2024-001', shelf_location: 'THE-A1' },
    // Journal
    { resource_id: rJournal, copy_number: 1, status: 'available',  condition: 'good',    accession_number: 'SER-001', shelf_location: 'SER-A1' },
    { resource_id: rJournal, copy_number: 2, status: 'available',  condition: 'good',    accession_number: 'SER-002', shelf_location: 'SER-A1' },
  ]).returning({ id: resourceCopies.id })

  const ids = C.map(c => c.id)
  // Destructure by index matching the insert order above
  const [
    cAlgo1, , ,
    cAI1, ,
    cClean1, ,
    cDB1, ,
    , ,
    cGatsby1, cGatsby2, ,
    cSun1, cSun2, cSun3,
    cOrgChem1, cOrgChem2, ,
    cCalc1, , ,
    cNur1, cNur2, ,
    cPsych1, cPsych2,
    cRes1, cRes2,
  ] = ids

  // ── Borrowing Records ───────────────────────────────────────────────────────
  const B = await db.insert(borrowingRecords).values([
    // Active borrows (due in the future)
    { copy_id: cAlgo1,    user_id: maria,       borrowed_at: daysAgo(4),  due_date: daysFromNow(3), fine_amount: 0 },
    { copy_id: cAI1,      user_id: juan,        borrowed_at: daysAgo(6),  due_date: daysFromNow(1), fine_amount: 0 },
    { copy_id: cDB1,      user_id: jose,        borrowed_at: daysAgo(2),  due_date: daysFromNow(5), fine_amount: 0 },
    { copy_id: cOrgChem1, user_id: drElena,     borrowed_at: daysAgo(0),  due_date: daysFromNow(7), fine_amount: 0 },
    { copy_id: cNur1,     user_id: liezl,       borrowed_at: daysAgo(3),  due_date: daysFromNow(4), fine_amount: 0 },
    { copy_id: cPsych1,   user_id: ana,         borrowed_at: daysAgo(5),  due_date: daysFromNow(2), fine_amount: 0 },
    { copy_id: cRes1,     user_id: sofia,       borrowed_at: daysAgo(1),  due_date: daysFromNow(6), fine_amount: 0 },
    { copy_id: cSun1,     user_id: marco,       borrowed_at: daysAgo(6),  due_date: daysFromNow(1), fine_amount: 0 },
    // Overdue (active, due date in past)
    { copy_id: cGatsby1,  user_id: carlos,      borrowed_at: daysAgo(12), due_date: daysAgo(5),     fine_amount: 25 },
    { copy_id: cCalc1,    user_id: profRicardo, borrowed_at: daysAgo(10), due_date: daysAgo(3),     fine_amount: 15 },
    { copy_id: cSun2,     user_id: miguel,      borrowed_at: daysAgo(15), due_date: daysAgo(8),     fine_amount: 40 },
    // Returned (historical)
    { copy_id: cClean1,   user_id: maria,       borrowed_at: daysAgo(30), due_date: daysAgo(23), returned_at: daysAgo(22), fine_amount: 0 },
    { copy_id: cSun3,     user_id: juan,        borrowed_at: daysAgo(25), due_date: daysAgo(18), returned_at: daysAgo(17), fine_amount: 0 },
    { copy_id: cGatsby2,  user_id: liezl,       borrowed_at: daysAgo(20), due_date: daysAgo(13), returned_at: daysAgo(12), fine_amount: 0 },
    { copy_id: cPsych2,   user_id: drElena,     borrowed_at: daysAgo(35), due_date: daysAgo(28), returned_at: daysAgo(28), fine_amount: 0 },
    { copy_id: cOrgChem2, user_id: sofia,       borrowed_at: daysAgo(22), due_date: daysAgo(15), returned_at: daysAgo(15), fine_amount: 0 },
    { copy_id: cNur2,     user_id: profAndres,  borrowed_at: daysAgo(40), due_date: daysAgo(33), returned_at: daysAgo(32), fine_amount: 0 },
    { copy_id: cRes2,     user_id: carlos,      borrowed_at: daysAgo(18), due_date: daysAgo(11), returned_at: daysAgo(9),  fine_amount: 10 },
    { copy_id: cAI1,      user_id: isabella,    borrowed_at: daysAgo(50), due_date: daysAgo(43), returned_at: daysAgo(42), fine_amount: 0 },
    { copy_id: cDB1,      user_id: marco,       borrowed_at: daysAgo(55), due_date: daysAgo(48), returned_at: daysAgo(47), fine_amount: 0 },
    { copy_id: cAlgo1,    user_id: roberto,     borrowed_at: daysAgo(60), due_date: daysAgo(53), returned_at: daysAgo(52), fine_amount: 0 },
    { copy_id: cNur1,     user_id: liezl,       borrowed_at: daysAgo(45), due_date: daysAgo(38), returned_at: daysAgo(37), fine_amount: 0 },
  ]).returning({ id: borrowingRecords.id })

  const [
    , , , , , , , ,
    bCarlosOverdue, bRicardoOverdue, bMiguelOverdue,
    , , , , , , bCarlosReturned,
  ] = B.map(b => b.id)

  // ── Reservations ────────────────────────────────────────────────────────────
  await db.insert(reservations).values([
    { resource_id: rNetSec,  user_id: juan,     status: 'active',    reserved_at: daysAgo(2) },
    { resource_id: rNetSec,  user_id: ana,      status: 'active',    reserved_at: daysAgo(1) },
    { resource_id: rPhilHist,user_id: liezl,    status: 'active',    reserved_at: daysAgo(5) },
    { resource_id: rAI,      user_id: isabella, status: 'fulfilled', reserved_at: daysAgo(55) },
    { resource_id: rCalc,    user_id: carlos,   status: 'cancelled', reserved_at: daysAgo(20) },
  ])

  // ── Fines ───────────────────────────────────────────────────────────────────
  await db.insert(fines).values([
    { borrowing_id: bCarlosOverdue,   amount: 25, paid: false },
    { borrowing_id: bRicardoOverdue,  amount: 15, paid: false },
    { borrowing_id: bMiguelOverdue,   amount: 40, paid: false },
    { borrowing_id: bCarlosReturned,  amount: 10, paid: true, paid_at: daysAgo(8) },
  ])

  // ── Gate Logs ───────────────────────────────────────────────────────────────
  const gateUsers = [maria, juan, liezl, jose, ana, carlos, sofia, marco, drElena, profRicardo]
  const gateEntries: Array<{ institution_id: number; user_id: number; direction: 'in' | 'out'; method: 'app'; logged_at: string }> = []

  // Cover March (≈79–49 days ago), April (≈48–19 days ago), and May so far (18–0 days ago)
  for (let day = 79; day >= 0; day--) {
    const count = 5 + (day % 4) // 5–8 visitors, deterministic
    const visitors = gateUsers.slice(0, count)
    for (let i = 0; i < visitors.length; i++) {
      const uid = visitors[i]
      const hour = 8 + (i % 8)
      const d = new Date()
      d.setDate(d.getDate() - day)
      d.setHours(hour, i * 7 % 60, 0, 0)
      gateEntries.push({ institution_id: iid, user_id: uid, direction: 'in',  method: 'app', logged_at: d.toISOString().slice(0, 19).replace('T', ' ') })
      if (day > 0) { // don't log exits for today so some patrons show as "inside"
        const dOut = new Date(d)
        dOut.setHours(d.getHours() + 1 + (i % 3))
        gateEntries.push({ institution_id: iid, user_id: uid, direction: 'out', method: 'app', logged_at: dOut.toISOString().slice(0, 19).replace('T', ' ') })
      }
    }
  }
  await db.insert(gateLogs).values(gateEntries)

  // ── Scan Sessions ────────────────────────────────────────────────────────────
  const [sess1] = await db.insert(scanSessions).values(
    { institution_id: iid, started_at: daysAgo(60), ended_at: daysAgo(59), status: 'completed' }
  ).returning({ id: scanSessions.id })

  const [sess2] = await db.insert(scanSessions).values(
    { institution_id: iid, started_at: daysAgo(30), ended_at: daysAgo(29), status: 'completed' }
  ).returning({ id: scanSessions.id })

  await db.insert(scanEntries).values([
    { session_id: sess1.id, isbn: '9780262033848', resource_id: rAlgo,    scanned_at: daysAgo(60) },
    { session_id: sess1.id, isbn: '9780134610993', resource_id: rAI,      scanned_at: daysAgo(60) },
    { session_id: sess1.id, isbn: '9780133970777', resource_id: rDB,      scanned_at: daysAgo(60) },
    { session_id: sess1.id, isbn: '9780743273565', resource_id: rGatsby,  scanned_at: daysAgo(60) },
    { session_id: sess2.id, isbn: '9780262033848', resource_id: rAlgo,    scanned_at: daysAgo(30) },
    { session_id: sess2.id, isbn: '9780134610993', resource_id: rAI,      scanned_at: daysAgo(30) },
    { session_id: sess2.id, isbn: '9780133970777', resource_id: rDB,      scanned_at: daysAgo(30) },
    { session_id: sess2.id, isbn: '9780743273565', resource_id: rGatsby,  scanned_at: daysAgo(30) },
    { session_id: sess2.id, isbn: '9780132350884', resource_id: rClean,   scanned_at: daysAgo(30) },
    { session_id: sess2.id, isbn: '9780134527338', resource_id: rNetSec,  scanned_at: daysAgo(30) },
  ])
}
