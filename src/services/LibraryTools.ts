import { BorrowService } from './BorrowService'
import { GateService } from './GateService'
import { ResourceService } from './ResourceService'
import { UserService } from './UserService'

// ── Off-topic guardrail ───────────────────────────────────────────────────────

const OFF_TOPIC_PATTERNS = [
  /\b(recipe|cooking|food|restaurant|cuisine)\b/i,
  /\b(sports|football|basketball|soccer|cricket|baseball)\b/i,
  /\b(music|song|playlist|album|artist|concert)\b/i,
  /\b(movie|film|netflix|series|tv show|anime)\b/i,
  /write me a (poem|story|essay|song|joke)/i,
  /\b(weather|forecast|temperature|humidity)\b/i,
  /\b(stock market|crypto|bitcoin|trading|investment)\b/i,
  /\b(politics|election|government|president)\b/i,
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
]

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

      default:
        return `Unknown tool: ${name}`
    }
  } catch (e) {
    console.error(`[LibraryTools] Tool "${name}" failed:`, e)
    return `Error retrieving data for tool "${name}".`
  }
}
