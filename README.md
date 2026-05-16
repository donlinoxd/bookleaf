# Bookleaf

An offline-first Android library management system for institutions that cannot afford commercial software or dedicated server hardware. One Android device acts as the library server; all other devices connect to it over local Wi-Fi — no internet required.

---

## How it works

```
Institution Wi-Fi
        │
        ├── Android (SERVER) ← librarian's device
        │     React Native app + local HTTP server + SQLite database
        │
        ├── Student Phone  ← installs same APK, runs in client mode
        ├── Teacher Phone  ← installs same APK, runs in client mode
        └── Any Android on the same Wi-Fi
```

The server device runs a Node.js HTTP server (via `nodejs-mobile-react-native`) on port 3000. Client devices discover the server by entering its IP address displayed on the dashboard.

---

## Features

### Server mode (librarian / admin)
- **Dashboard** — live stats (total books, available, borrowed, overdue), quick actions, server start/stop with IP display
- **Book catalog** — search, filter, add books manually or by ISBN barcode scan, manage copies
- **Book detail** — availability stats, copy list with status/condition, full borrowing history, inline edit
- **Borrow / Return** — check out and return books by member ID lookup, auto-calculate overdue fines on return
- **Members** — register members, assign roles, view profiles, manage fines, reset PINs
- **OPAC** — in-app public catalog for members using the librarian's device

### Client mode (students / teachers)
- **Catalog search** — search books by title, author, genre, or ISBN over Wi-Fi
- **My Books** — self-lookup by ID number to view borrowed books, due dates, and outstanding fines

---

## Tech stack

| Layer | Technology |
|---|---|
| Framework | React Native + Expo (TypeScript) |
| Routing | Expo Router (file-based) |
| Database | SQLite via `expo-sqlite` (server device only) |
| Local HTTP server | `nodejs-mobile-react-native` + Node.js `http` module |
| State | Zustand |
| Barcode scanning | `expo-camera` |
| Server discovery | Manual IP entry (mDNS via `react-native-zeroconf` planned) |

---

## Project structure

```
app/
  index.tsx                  Boot router — reads saved mode and redirects
  (auth)/
    setup.tsx                First-launch mode selector (Server or Client)
    register.tsx             Institution + admin account setup
    login.tsx                PIN login for server users
    connect.tsx              Client mode — enter server IP to connect
  (server)/
    dashboard.tsx            Stats + overdue alerts + server status card
    books.tsx                Book catalog with search
    borrow.tsx               Checkout and return flows
    members.tsx              Member list
    opac.tsx                 In-app public catalog
    book/
      [id].tsx               Book detail + edit modal + copy management
      add.tsx                Add book form with barcode scanner
    member/
      [id].tsx               Member detail + edit + PIN reset + fines
      add.tsx                Add member form with role selector
  (client)/
    home.tsx                 OPAC search via server REST API
    my-books.tsx             Patron self-lookup

src/
  db/
    schema.ts                SQL table definitions and default settings
    database.ts              DB init, migrations, PIN hashing (SHA-256)
  services/
    BookService.ts           Book CRUD, search, copy management
    UserService.ts           Member auth, CRUD, PIN management
    BorrowService.ts         Checkout, return, fine calculation, history
    SettingsService.ts       Configurable institution settings
    ReportService.ts         Analytics queries (most borrowed, fines summary)
    ApiServer.ts             REST handler — called by the Node.js bridge
    ServerBridge.ts          nodejs-mobile ↔ expo-sqlite message bridge
  store/
    appStore.ts              Global Zustand state (mode, user, institution)
  types/
    index.ts                 All TypeScript interfaces
  utils/
    networkInfo.ts           Wi-Fi IP address helper

nodejs-assets/
  nodejs-project/
    main.js                  Node.js HTTP server (port 3000)
    package.json             Node.js project descriptor
```

---

## Database schema

```
institutions      id, name, address, logo_uri
users             id, institution_id, name, id_number, role, pin_hash, is_active
books             id, institution_id, isbn, title, author, publisher, year, genre,
                  description, cover_uri, total_copies, available_copies
book_copies       id, book_id, copy_number, condition, status
borrowing_records id, copy_id, user_id, borrowed_at, due_date, returned_at, fine_amount
reservations      id, book_id, user_id, reserved_at, status
fines             id, borrowing_id, amount, paid, paid_at
settings          key, value
```

---

## Getting started

### Prerequisites
- Node.js 18+
- Android Studio with Android SDK
- A physical Android device (recommended) or emulator

### Install dependencies

```bash
npm install
```

### Run on Android

```bash
npm run android
```

### First launch — Server device

1. Select **Set up as SERVER**
2. Enter institution name and create an admin account
3. Log in and tap **Start** on the server status card
4. Share the displayed IP address with students/teachers

### First launch — Client device

1. Select **Connect to SERVER**
2. Enter the IP address shown on the server device
3. Tap **Connect** to open the catalog

---

## User roles

| Role | Permissions |
|---|---|
| **Admin** | Full access — manage books, members, settings, reset PINs, deactivate accounts |
| **Librarian** | Manage books, process borrow/return, view members |
| **Member** | Browse OPAC, view own borrowed books and fines |

---

## Configurable settings

Accessible from Settings (admin only):

| Setting | Default | Description |
|---|---|---|
| `fine_per_day` | ₱5.00 | Fine charged per day overdue |
| `max_borrow_days` | 7 | Days before a book is due |
| `max_books_per_member` | 3 | Maximum concurrent borrows per member |
| `institution_name` | My Library | Displayed on OPAC and dashboard |

---

## Roadmap

### v1 (current)
- [x] Server / client mode architecture
- [x] Book catalog with barcode scanning
- [x] Borrow / return with fine calculation
- [x] Member management with role-based access
- [x] OPAC for patrons
- [x] Local HTTP REST API for client devices

### v2 (planned)
- [ ] mDNS auto-discovery (no manual IP entry)
- [ ] Local LLM — natural language catalog search and book recommendations
- [ ] Backup and restore (export/import SQLite as JSON)
- [ ] PDF report export (overdue list, inventory, fine collection)
- [ ] Reservations flow
- [ ] Book cover image support
