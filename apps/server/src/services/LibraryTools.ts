import { BorrowService } from './BorrowService'
import { CirculationReportService } from './CirculationReportService'
import { CollectionReportService } from './CollectionReportService'
import { GateService } from './GateService'
import { InventoryService } from './InventoryService'
import { PatronReportService } from './PatronReportService'
import { ReservationService } from './ReservationService'
import { ResourceService } from './ResourceService'
import { UserService } from './UserService'

// ── Off-topic guardrail ───────────────────────────────────────────────────────

const OFF_TOPIC_PATTERNS = [
  // Food & lifestyle
  /\b(recipe|cooking|food|restaurant|cuisine|diet|calorie|ingredient|meal prep)\b/i,
  // Sports
  /\b(sports|football|basketball|soccer|cricket|baseball|volleyball|tennis|golf|swimming|athletics|olympics)\b/i,
  // Music
  /\b(music|song|playlist|album|artist|concert|lyrics|spotify|soundcloud|mp3)\b/i,
  // Entertainment
  /\b(movie|film|netflix|hulu|disney\+|series|tv show|anime|episode|streaming|watch online)\b/i,
  // Creative writing requests
  /write (me )?(a |an )?(poem|story|essay|song|joke|rap|letter to|speech)/i,
  // Weather
  /\b(weather|forecast|temperature|humidity|rainfall|typhoon|storm|climate today)\b/i,
  // Finance
  /\b(stock market|crypto|bitcoin|ethereum|trading|investment|forex|nft|mutual fund)\b/i,
  // Politics
  /\b(politics|election|government|president|senator|congress|referendum|campaign)\b/i,
  // Social media
  /\b(instagram|twitter|facebook|tiktok|youtube|snapchat|reddit|pinterest|linkedin)\b/i,
  // Gaming
  /\b(video game|gaming|console|playstation|xbox|nintendo|steam|mobile game|esports|fps game)\b/i,
  // Dating & relationships
  /\b(dating|tinder|bumble|girlfriend|boyfriend|crush|breakup|marriage proposal|hookup)\b/i,
  // Fashion & beauty
  /\b(fashion|makeup|skincare|hairstyle|outfit|clothing brand|nail art|perfume)\b/i,
  // Vehicles
  /\b(car repair|mechanic|car model|best car|motorcycle|automobile|oil change|car price)\b/i,
  // Real estate
  /\b(real estate|house for sale|rent apartment|condo|property price|mortgage)\b/i,
  // Travel booking
  /\b(flight booking|hotel booking|airbnb|travel package|visa application|tour guide)\b/i,
  // Medical / legal advice
  /\b(diagnos(e|is)|symptom|prescription|drug dosage|legal advice|lawsuit|attorney)\b/i,
  // Jokes / trivia unrelated to libraries
  /tell me a joke/i,
  /random fact about/i,
]

export function isOffTopic(message: string): boolean {
  return OFF_TOPIC_PATTERNS.some((p) => p.test(message))
}

// ── Tool definitions (OpenAI-compatible JSON Schema) ─────────────────────────

export const TOOL_DEFINITIONS = [
  {
    type: 'function',
    function: {
      name: 'search_resources',
      description: 'Search the library catalog for books and resources by title, author, ISBN, or genre.',
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'The search term — title, author name, ISBN, or genre keyword.',
          },
        },
        required: ['query'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_patron_info',
      description: 'Look up a library patron by name or ID number. Returns profile, active borrows, and status.',
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'Patron name or ID number to search for.',
          },
        },
        required: ['query'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_patron_fines',
      description: 'Check outstanding fines. Pass a patron name/ID to get fines for a specific patron, or leave query empty to list all patrons with unpaid fines.',
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'Patron name or ID number. Leave empty to list all patrons with outstanding fines.',
          },
        },
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_overdue_books',
      description: 'Get a list of all currently overdue books with borrower names and due dates.',
      parameters: {
        type: 'object',
        properties: {},
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_circulation_stats',
      description: 'Get circulation statistics: currently borrowed count, returned count, total transactions, and fines accrued.',
      parameters: {
        type: 'object',
        properties: {},
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_today_gate_activity',
      description: 'Get today\'s library gate/attendance activity: unique visitor count, who is currently inside, and recent entries.',
      parameters: {
        type: 'object',
        properties: {},
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_patron_borrow_history',
      description: 'Get the full borrowing history for a patron — all books they have ever borrowed, including returned ones.',
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'Patron name or ID number.',
          },
        },
        required: ['query'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_reservations',
      description: 'Get active book reservations/holds. Pass a patron name or ID to see that patron\'s reservations, or leave query empty to list all active reservations.',
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'Patron name or ID number. Leave empty to list all active reservations.',
          },
        },
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_top_borrowers',
      description: 'Get the most active borrowers in the library — patrons with the highest total borrow count.',
      parameters: {
        type: 'object',
        properties: {},
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_most_borrowed',
      description: 'Get the most borrowed books/resources in the library by borrow count.',
      parameters: {
        type: 'object',
        properties: {},
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_collection_overview',
      description: 'Get a summary of the library collection: total titles, total copies, available vs borrowed vs damaged/lost counts.',
      parameters: {
        type: 'object',
        properties: {},
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_resource_borrowers',
      description: 'Find out who currently has a specific book/resource checked out — active borrowers for a given title.',
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'Book title or keyword to search for.',
          },
        },
        required: ['query'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'check_patron_eligibility',
      description: 'Check whether a patron is currently allowed to borrow books — considers active fines, borrow limits, and account status.',
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'Patron name or ID number.',
          },
        },
        required: ['query'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_patron_stats',
      description: 'Get patron/member demographics: total members, active vs inactive, breakdown by user type and department.',
      parameters: {
        type: 'object',
        properties: {},
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_monthly_trends',
      description: 'Get monthly borrowing and return trends over the past 12 months to see library usage over time.',
      parameters: {
        type: 'object',
        properties: {},
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_collection_by_type',
      description: 'Get the library collection broken down by material type (book, serial, thesis, audiovisual, etc.) with title and copy counts.',
      parameters: {
        type: 'object',
        properties: {},
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_gate_logs_by_date',
      description: 'Get library gate/attendance logs for a specific date. Use YYYY-MM-DD format. Defaults to today if no date is given.',
      parameters: {
        type: 'object',
        properties: {
          date: {
            type: 'string',
            description: 'Date in YYYY-MM-DD format, e.g. "2025-05-18". Leave empty for today.',
          },
        },
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_resource_copies',
      description: 'Show all physical copies of a specific book — includes barcode, shelf location, accession number, and condition of each copy.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Book title or keyword.' },
        },
        required: ['query'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_resource_history',
      description: 'Get the full borrowing history of a specific book — everyone who has ever borrowed it and when.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Book title or keyword.' },
        },
        required: ['query'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_resource_reservations',
      description: 'Get the active reservation queue for a specific book — who is waiting and in what order.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Book title or keyword.' },
        },
        required: ['query'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_condition_summary',
      description: 'Get a breakdown of the physical condition of all copies in the collection (good, damaged, lost).',
      parameters: {
        type: 'object',
        properties: {},
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_collection_by_year',
      description: 'Get the library collection grouped by publication year range — useful for assessing how current the collection is.',
      parameters: {
        type: 'object',
        properties: {},
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_new_registrations',
      description: 'Get monthly new member/patron registration counts over the past 6 months.',
      parameters: {
        type: 'object',
        properties: {},
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_attendance_trends',
      description: 'Get monthly library attendance trends — unique visitors and total visits per month over the past 6 months.',
      parameters: {
        type: 'object',
        properties: {},
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_detailed_circulation',
      description: 'Get accurate library-wide circulation totals: total borrows ever, currently borrowed, overdue count, returned, and active borrowers.',
      parameters: {
        type: 'object',
        properties: {},
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_patron_location',
      description: 'Check whether a specific patron is currently inside the library based on their last gate entry or exit.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Patron name or ID number.' },
        },
        required: ['query'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_inventory_status',
      description: 'Check whether there is an active inventory scan session in progress and how far along it is.',
      parameters: {
        type: 'object',
        properties: {},
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_inventory_sessions',
      description: 'List completed inventory scan sessions — useful for checking when the last inventory audit was done.',
      parameters: {
        type: 'object',
        properties: {},
        required: [],
      },
    },
  },
]

// ── Tool router ───────────────────────────────────────────────────────────────

const TOOL_ROUTES: Record<string, string[]> = {
  patron: [
    'get_patron_info', 'get_patron_fines', 'get_patron_borrow_history',
    'check_patron_eligibility', 'get_patron_location', 'get_patron_stats',
    'get_new_registrations', 'get_reservations',
  ],
  resource: [
    'search_resources', 'get_resource_copies', 'get_resource_borrowers',
    'get_resource_history', 'get_resource_reservations', 'get_most_borrowed',
  ],
  overdue: [
    'get_overdue_books', 'get_patron_fines', 'get_detailed_circulation',
  ],
  fine: [
    'get_patron_fines', 'get_overdue_books', 'check_patron_eligibility',
  ],
  stats: [
    'get_detailed_circulation', 'get_circulation_stats', 'get_monthly_trends',
    'get_top_borrowers', 'get_most_borrowed', 'get_attendance_trends',
    'get_collection_overview', 'get_collection_by_type', 'get_collection_by_year',
    'get_condition_summary', 'get_patron_stats', 'get_new_registrations',
  ],
  gate: [
    'get_today_gate_activity', 'get_gate_logs_by_date', 'get_patron_location',
  ],
  reservation: [
    'get_reservations', 'get_resource_reservations', 'get_patron_info',
  ],
  inventory: [
    'get_inventory_status', 'get_inventory_sessions',
  ],
}

const ROUTE_PATTERNS: Array<{ pattern: RegExp; routes: string[] }> = [
  { pattern: /\b(patron|member|student|borrower|person|who|user|faculty|alumni|staff|liezl|john|maria)\b/i, routes: ['patron'] },
  { pattern: /\b(book|resource|title|author|isbn|copy|copies|shelf|catalog|item|accession)\b/i, routes: ['resource'] },
  { pattern: /\b(overdue|late|past due|not returned|unreturned)\b/i, routes: ['overdue'] },
  { pattern: /\b(fine|penalty|fee|payment|unpaid)\b/i, routes: ['fine'] },
  { pattern: /\b(gate|visit|attendance|inside|enter|exit|direction|present)\b/i, routes: ['gate'] },
  { pattern: /\b(inventor|scan session|discrepanc|audit)\b/i, routes: ['inventory'] },
  { pattern: /\b(reserv|hold|queue|waiting|waitlist)\b/i, routes: ['reservation'] },
  { pattern: /\b(stat|report|trend|analytic|overview|summary|popular|top|most|monthly|annual|how many|count|total|breakdown|age|year|condition|damage|lost)\b/i, routes: ['stats'] },
]

const FALLBACK_TOOLS = [
  'search_resources', 'get_patron_info', 'get_overdue_books',
  'get_today_gate_activity', 'get_circulation_stats',
]

export function routeTools(query: string): typeof TOOL_DEFINITIONS {
  const matchedRoutes = new Set<string>()
  for (const { pattern, routes } of ROUTE_PATTERNS) {
    if (pattern.test(query)) routes.forEach((r) => matchedRoutes.add(r))
  }
  if (matchedRoutes.size === 0) {
    return TOOL_DEFINITIONS.filter((t) => FALLBACK_TOOLS.includes(t.function.name))
  }
  const toolNames = new Set<string>()
  for (const route of matchedRoutes) TOOL_ROUTES[route]?.forEach((t) => toolNames.add(t))
  return TOOL_DEFINITIONS.filter((t) => toolNames.has(t.function.name))
}

// ── Tool execution ────────────────────────────────────────────────────────────

export async function executeTool(
  name: string,
  args: Record<string, any>,
  institutionId: number,
): Promise<string> {
  try {
    switch (name) {
      case 'search_resources': {
        const query = args.query ?? ''
        const results = await ResourceService.search(institutionId, query)
        if (!results.length) return `No resources found matching "${query}".`
        const lines = results.slice(0, 8).map((r, i) =>
          `${i + 1}. "${r.title}" by ${r.author}` +
          `${r.isbn ? ` | ISBN: ${r.isbn}` : ''}` +
          ` | ${r.available_copies}/${r.total_copies} copies available` +
          `${r.call_number ? ` | Call No: ${r.call_number}` : ''}` +
          `${r.genre ? ` | Genre: ${r.genre}` : ''}`,
        )
        return (
          `Search results for "${query}" (${results.length} found):\n` +
          lines.join('\n') +
          (results.length > 8 ? `\n...and ${results.length - 8} more` : '')
        )
      }

      case 'get_patron_info': {
        const query = args.query ?? ''
        if (!query.trim()) return 'Please specify a patron name or ID number.'
        const matched = await UserService.search(institutionId, query)
        if (!matched.length) return `No patron found matching "${query}".`
        const u = matched[0]
        const active = await BorrowService.getActiveByUser(u.id)
        return (
          `Patron: ${u.name} (ID: ${u.id_number})\n` +
          `Role: ${u.role} | Type: ${u.user_type ?? 'N/A'} | Department: ${u.department ?? 'N/A'}\n` +
          `Status: ${u.is_active ? 'Active' : 'Inactive'}\n` +
          `Currently borrowed: ${active.length} item(s)` +
          (active.length
            ? '\n' + active.map((b: any) => `  - "${b.book_title}" — due ${b.due_date?.slice(0, 10)}`).join('\n')
            : '')
        )
      }

      case 'get_patron_fines': {
        const query = (args.query ?? '').trim()
        if (!query) {
          const overdue = await BorrowService.getOverdue()
          const withFines = overdue.filter((b: any) => (b.fine_amount ?? 0) > 0)
          if (!withFines.length) return 'No outstanding fines at the moment.'
          return (
            `Patrons with outstanding fines (${withFines.length}):\n` +
            withFines
              .slice(0, 10)
              .map((b: any) => `- ${b.member_name}: ₱${(b.fine_amount ?? 0).toFixed(2)} for "${b.book_title}"`)
              .join('\n')
          )
        }
        const matched = await UserService.search(institutionId, query)
        if (!matched.length) return `No patron found matching "${query}".`
        const u = matched[0]
        const fineRecords = await BorrowService.getUserFines(u.id)
        if (!fineRecords.length) return `${u.name} has no outstanding unpaid fines.`
        const total = fineRecords.reduce((sum, f) => sum + (f.amount ?? 0), 0)
        return (
          `Fines for ${u.name}:\n` +
          fineRecords.map((f) => `- ₱${(f.amount ?? 0).toFixed(2)} (${f.paid ? 'paid' : 'unpaid'})`).join('\n') +
          `\nTotal unpaid: ₱${total.toFixed(2)}`
        )
      }

      case 'get_overdue_books': {
        const overdue = await BorrowService.getOverdue()
        if (!overdue.length) return 'No overdue books at the moment.'
        return (
          `Overdue books (${overdue.length} total):\n` +
          overdue
            .slice(0, 10)
            .map(
              (b: any) =>
                `- "${b.book_title}" — borrowed by ${b.member_name} | Due: ${b.due_date?.slice(0, 10)}` +
                ((b.fine_amount ?? 0) > 0 ? ` | Fine: ₱${(b.fine_amount ?? 0).toFixed(2)}` : ''),
            )
            .join('\n') +
          (overdue.length > 10 ? `\n...and ${overdue.length - 10} more` : '')
        )
      }

      case 'get_circulation_stats': {
        const history = await BorrowService.getHistory(institutionId, 100)
        const active = history.filter((b: any) => !b.returned_at)
        const returned = history.filter((b: any) => b.returned_at)
        const totalFines = history.reduce((sum: number, b: any) => sum + (b.fine_amount ?? 0), 0)
        return (
          `Circulation overview (last 100 records):\n` +
          `- Currently borrowed: ${active.length}\n` +
          `- Returned: ${returned.length}\n` +
          `- Total transactions: ${history.length}\n` +
          `- Total fines accrued: ₱${totalFines.toFixed(2)}`
        )
      }

      case 'get_today_gate_activity': {
        const { total, inside } = await GateService.getTodayCount(institutionId)
        const logs = await GateService.getTodayLogs(institutionId)
        return (
          `Today's gate activity:\n` +
          `- Unique visitors: ${total}\n` +
          `- Currently inside: ${inside}\n` +
          (logs.length
            ? `Recent entries:\n` +
              logs
                .slice(0, 5)
                .map((l: any) => `  - ${l.user_name} (${l.direction}) at ${l.logged_at}`)
                .join('\n')
            : '  No gate logs yet today.')
        )
      }

      case 'get_patron_borrow_history': {
        const query = args.query ?? ''
        if (!query.trim()) return 'Please specify a patron name or ID number.'
        const matched = await UserService.search(institutionId, query)
        if (!matched.length) return `No patron found matching "${query}".`
        const u = matched[0]
        const history = await BorrowService.getFullHistoryByUser(u.id)
        if (!history.length) return `${u.name} has no borrowing history.`
        const lines = history.slice(0, 15).map((b: any) =>
          `- "${b.book_title}" | Borrowed: ${b.borrowed_at?.slice(0, 10)}` +
          (b.returned_at ? ` | Returned: ${b.returned_at.slice(0, 10)}` : ' | Not yet returned') +
          (b.due_date ? ` | Due: ${b.due_date.slice(0, 10)}` : ''),
        )
        return (
          `Borrow history for ${u.name} (${history.length} record(s)):\n` +
          lines.join('\n') +
          (history.length > 15 ? `\n...and ${history.length - 15} more` : '')
        )
      }

      case 'get_reservations': {
        const query = (args.query ?? '').trim()
        if (query) {
          const matched = await UserService.search(institutionId, query)
          if (!matched.length) return `No patron found matching "${query}".`
          const u = matched[0]
          const recs = await ReservationService.getByUser(u.id)
          const active = recs.filter((r: any) => r.status === 'active')
          if (!active.length) return `${u.name} has no active reservations.`
          return (
            `Active reservations for ${u.name} (${active.length}):\n` +
            active
              .map((r: any) =>
                `- "${r.book_title}" by ${r.book_author}` +
                ` | Available copies: ${r.available_copies ?? 'N/A'}` +
                ` | Reserved: ${r.reserved_at?.slice(0, 10)}`,
              )
              .join('\n')
          )
        }
        const all = await ReservationService.getAll(institutionId)
        if (!all.length) return 'No active reservations at the moment.'
        return (
          `Active reservations (${all.length}):\n` +
          all
            .slice(0, 10)
            .map((r: any) =>
              `- "${r.book_title}" by ${r.book_author} — reserved by ${r.member_name}` +
              ` | Since: ${r.reserved_at?.slice(0, 10)}`,
            )
            .join('\n') +
          (all.length > 10 ? `\n...and ${all.length - 10} more` : '')
        )
      }

      case 'get_top_borrowers': {
        const rows = await CirculationReportService.getTopBorrowers(institutionId, 10)
        if (!rows.length) return 'No borrowing activity recorded yet.'
        return (
          `Top borrowers:\n` +
          rows
            .map((r, i) =>
              `${i + 1}. ${r.user_name} (${r.user_id_number}) — ${r.total_borrows} total, ${r.active_borrows} active`,
            )
            .join('\n')
        )
      }

      case 'get_most_borrowed': {
        const rows = await CirculationReportService.getMostBorrowed(institutionId, 10)
        if (!rows.length) return 'No borrowing activity recorded yet.'
        return (
          `Most borrowed resources:\n` +
          rows
            .map((r, i) => `${i + 1}. "${r.title}" by ${r.author} — ${r.borrow_count} borrow(s)`)
            .join('\n')
        )
      }

      case 'get_collection_overview': {
        const o = await CollectionReportService.getOverview(institutionId)
        return (
          `Collection overview:\n` +
          `- Total titles: ${o.total_titles}\n` +
          `- Total copies: ${o.total_copies}\n` +
          `- Available: ${o.available_copies}\n` +
          `- Borrowed: ${o.borrowed_copies}\n` +
          `- Damaged: ${o.damaged_copies}\n` +
          `- Lost: ${o.lost_copies}\n` +
          `- Registered members: ${o.registered_members}\n` +
          `- Copies per member: ${o.copies_per_member.toFixed(2)}`
        )
      }

      case 'get_resource_borrowers': {
        const query = args.query ?? ''
        if (!query.trim()) return 'Please specify a book title or keyword.'
        const results = await ResourceService.search(institutionId, query)
        if (!results.length) return `No resource found matching "${query}".`
        const resource = results[0]
        const borrows = await BorrowService.getActiveBorrowsByResource(resource.id)
        if (!borrows.length) return `"${resource.title}" is not currently checked out by anyone.`
        return (
          `Current borrowers of "${resource.title}" (${borrows.length}):\n` +
          borrows
            .map((b: any) =>
              `- ${b.member_name} (${b.member_id_number}) | Borrowed: ${b.borrowed_at?.slice(0, 10)} | Due: ${b.due_date?.slice(0, 10)}`,
            )
            .join('\n')
        )
      }

      case 'check_patron_eligibility': {
        const query = args.query ?? ''
        if (!query.trim()) return 'Please specify a patron name or ID number.'
        const matched = await UserService.search(institutionId, query)
        if (!matched.length) return `No patron found matching "${query}".`
        const u = matched[0]
        const { allowed, reason } = await BorrowService.canBorrow(u.id)
        return allowed
          ? `${u.name} is eligible to borrow books.`
          : `${u.name} is NOT eligible to borrow books. Reason: ${reason ?? 'unknown'}.`
      }

      case 'get_patron_stats': {
        const [overview, byType, byDept] = await Promise.all([
          PatronReportService.getOverview(institutionId),
          PatronReportService.getByType(institutionId),
          PatronReportService.getByDepartment(institutionId),
        ])
        const typeLines = byType.map((r) => `  - ${r.user_type}: ${r.count} (${r.active} active)`).join('\n')
        const deptLines = byDept
          .slice(0, 8)
          .map((r) => `  - ${r.department}: ${r.count} member(s), ${r.active_borrowers} active borrower(s)`)
          .join('\n')
        return (
          `Patron statistics:\n` +
          `- Total members: ${overview.total_members}\n` +
          `- Active: ${overview.active_members} | Inactive: ${overview.inactive_members}\n` +
          `- Currently borrowing: ${overview.active_borrowers}\n` +
          `- Never borrowed: ${overview.never_borrowed}\n` +
          `- Staff accounts: ${overview.total_staff}\n` +
          (byType.length ? `\nBy type:\n${typeLines}` : '') +
          (byDept.length ? `\nBy department:\n${deptLines}` : '')
        )
      }

      case 'get_monthly_trends': {
        const rows = await CirculationReportService.getMonthlyTrends(institutionId, 12)
        if (!rows.length) return 'No monthly trend data available yet.'
        return (
          `Monthly borrowing trends (last 12 months):\n` +
          rows.map((r) => `- ${r.label}: ${r.borrows} borrowed, ${r.returns} returned`).join('\n')
        )
      }

      case 'get_collection_by_type': {
        const rows = await CollectionReportService.getByMaterialType(institutionId)
        if (!rows.length) return 'No collection data available.'
        return (
          `Collection by material type:\n` +
          rows.map((r) => `- ${r.material_type}: ${r.titles} title(s), ${r.copies} cop(ies)`).join('\n')
        )
      }

      case 'get_gate_logs_by_date': {
        const date = (args.date ?? '').trim() || new Date().toISOString().slice(0, 10)
        const logs = await GateService.getLogsByDate(institutionId, date)
        if (!logs.length) return `No gate activity recorded for ${date}.`
        const unique = new Set(logs.map((l: any) => l.user_id)).size
        return (
          `Gate activity for ${date} (${logs.length} log(s), ${unique} unique visitor(s)):\n` +
          logs
            .slice(0, 15)
            .map((l: any) => `- ${l.user_name} (${l.user_role}) — ${l.direction} at ${l.logged_at}`)
            .join('\n') +
          (logs.length > 15 ? `\n...and ${logs.length - 15} more` : '')
        )
      }

      case 'get_resource_copies': {
        const query = args.query ?? ''
        if (!query.trim()) return 'Please specify a book title or keyword.'
        const results = await ResourceService.search(institutionId, query)
        if (!results.length) return `No resource found matching "${query}".`
        const resource = results[0]
        const copies = await ResourceService.getCopies(resource.id)
        if (!copies.length) return `No copies found for "${resource.title}".`
        return (
          `Copies of "${resource.title}" (${copies.length} total):\n` +
          copies
            .map((c) =>
              `- Copy #${c.copy_number} | Status: ${c.status} | Condition: ${c.condition}` +
              (c.barcode ? ` | Barcode: ${c.barcode}` : '') +
              (c.accession_number ? ` | Accession: ${c.accession_number}` : '') +
              (c.shelf_location ? ` | Shelf: ${c.shelf_location}` : ''),
            )
            .join('\n')
        )
      }

      case 'get_resource_history': {
        const query = args.query ?? ''
        if (!query.trim()) return 'Please specify a book title or keyword.'
        const results = await ResourceService.search(institutionId, query)
        if (!results.length) return `No resource found matching "${query}".`
        const resource = results[0]
        const history = await BorrowService.getHistoryByResource(resource.id, 20)
        if (!history.length) return `"${resource.title}" has never been borrowed.`
        return (
          `Borrow history for "${resource.title}" (${history.length} record(s)):\n` +
          history
            .map((b: any) =>
              `- ${b.member_name} (${b.member_id_number}) | Borrowed: ${b.borrowed_at?.slice(0, 10)}` +
              (b.returned_at ? ` | Returned: ${b.returned_at.slice(0, 10)}` : ' | Not yet returned'),
            )
            .join('\n')
        )
      }

      case 'get_resource_reservations': {
        const query = args.query ?? ''
        if (!query.trim()) return 'Please specify a book title or keyword.'
        const results = await ResourceService.search(institutionId, query)
        if (!results.length) return `No resource found matching "${query}".`
        const resource = results[0]
        const queue = await ReservationService.getActiveByResource(resource.id)
        if (!queue.length) return `No active reservations for "${resource.title}".`
        return (
          `Reservation queue for "${resource.title}" (${queue.length} in line):\n` +
          queue
            .map((r: any, i: number) =>
              `${i + 1}. ${r.member_name} (${r.member_id_number}) | Since: ${r.reserved_at?.slice(0, 10)}`,
            )
            .join('\n')
        )
      }

      case 'get_condition_summary': {
        const rows = await CollectionReportService.getConditionSummary(institutionId)
        if (!rows.length) return 'No condition data available.'
        return (
          `Copy condition summary:\n` +
          rows.map((r) => `- ${r.condition}: ${r.copies} cop(ies)`).join('\n')
        )
      }

      case 'get_collection_by_year': {
        const rows = await CollectionReportService.getByPublicationYear(institutionId)
        if (!rows.length) return 'No publication year data available.'
        return (
          `Collection by publication year:\n` +
          rows.map((r) => `- ${r.bucket}: ${r.titles} title(s), ${r.copies} cop(ies)`).join('\n')
        )
      }

      case 'get_new_registrations': {
        const rows = await PatronReportService.getMonthlyRegistrations(institutionId, 6)
        if (!rows.length) return 'No registration data available.'
        return (
          `New member registrations (last 6 months):\n` +
          rows.map((r) => `- ${r.label}: ${r.count} new member(s)`).join('\n')
        )
      }

      case 'get_attendance_trends': {
        const rows = await PatronReportService.getMonthlyAttendance(institutionId, 6)
        if (!rows.length) return 'No attendance data available.'
        return (
          `Monthly attendance (last 6 months):\n` +
          rows
            .map((r) => `- ${r.label}: ${r.unique_visitors} unique visitor(s), ${r.total_visits} total visit(s)`)
            .join('\n')
        )
      }

      case 'get_detailed_circulation': {
        const o = await CirculationReportService.getOverview(institutionId)
        return (
          `Circulation summary:\n` +
          `- Total borrows (all time): ${o.total_borrows}\n` +
          `- Currently borrowed: ${o.currently_borrowed}\n` +
          `- Overdue: ${o.overdue}\n` +
          `- Returned: ${o.returned}\n` +
          `- Active borrowers: ${o.active_borrowers}`
        )
      }

      case 'get_patron_location': {
        const query = args.query ?? ''
        if (!query.trim()) return 'Please specify a patron name or ID number.'
        const matched = await UserService.search(institutionId, query)
        if (!matched.length) return `No patron found matching "${query}".`
        const u = matched[0]
        const direction = await GateService.getLastDirection(u.id)
        if (!direction) return `${u.name} has no gate log — never recorded entering or exiting.`
        return direction === 'in'
          ? `${u.name} is currently inside the library.`
          : `${u.name} is not currently inside the library (last recorded: exit).`
      }

      case 'get_inventory_status': {
        const session = await InventoryService.getActiveSession(institutionId)
        if (!session) return 'No inventory scan is currently in progress.'
        const progress = await InventoryService.getSessionProgress(session.id)
        return (
          `Active inventory session (ID: ${session.id}):\n` +
          `- Started: ${session.started_at?.slice(0, 16)}\n` +
          `- Items scanned: ${progress.totalScanned}\n` +
          `- Unique ISBNs: ${progress.uniqueIsbns}`
        )
      }

      case 'get_inventory_sessions': {
        const sessions = await InventoryService.getCompletedSessions(institutionId)
        if (!sessions.length) return 'No completed inventory sessions found.'
        return (
          `Completed inventory sessions (${sessions.length}):\n` +
          sessions
            .slice(0, 10)
            .map((s) =>
              `- Session #${s.id} | Started: ${s.started_at?.slice(0, 10)}` +
              (s.ended_at ? ` | Ended: ${s.ended_at.slice(0, 10)}` : ''),
            )
            .join('\n') +
          (sessions.length > 10 ? `\n...and ${sessions.length - 10} more` : '')
        )
      }

      default:
        return `Unknown tool: ${name}`
    }
  } catch (e) {
    console.error(`[LibraryTools] Tool "${name}" failed:`, e)
    return `Error retrieving data for tool "${name}".`
  }
}
