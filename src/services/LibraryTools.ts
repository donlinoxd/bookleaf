import { BorrowService } from './BorrowService'
import { GateService } from './GateService'
import { ResourceService } from './ResourceService'
import { UserService } from './UserService'

export type ToolName =
  | 'search_resources'
  | 'get_patron_info'
  | 'get_patron_fines'
  | 'get_overdue_books'
  | 'get_circulation_stats'
  | 'get_today_gate_activity'
  | 'general'
  | 'off_topic'

export type DetectedIntent = {
  tool: ToolName
  query: string
}

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

export function detectIntent(message: string): DetectedIntent {
  if (OFF_TOPIC_PATTERNS.some((p) => p.test(message))) {
    return { tool: 'off_topic', query: message }
  }

  // Gate / attendance
  if (/\b(gate|visitor|attendance|who.s (here|inside|present)|people inside|came in today)\b/i.test(message)) {
    return { tool: 'get_today_gate_activity', query: message }
  }

  // Circulation stats / reports
  if (/\b(statistic|stats|how many (loan|borrow|book.? borrowed)|lending activity|circulation|report|summary)\b/i.test(message)) {
    return { tool: 'get_circulation_stats', query: message }
  }

  // Overdue
  if (/\b(overdue|past due|late (book|return)|not returned|unreturned|still out)\b/i.test(message)) {
    return { tool: 'get_overdue_books', query: message }
  }

  // Fines (check before patron_info since "patron fines" hits fine pattern first)
  if (/\b(fine|penalty|owe|owes|debt|unpaid|outstanding (fine|balance))\b/i.test(message)) {
    return { tool: 'get_patron_fines', query: extractEntityQuery(message) }
  }

  // Patron lookup
  if (/\b(patron|member|student|faculty|borrower|who is|find (user|patron|member|student)|lookup)\b/i.test(message)) {
    return { tool: 'get_patron_info', query: extractEntityQuery(message) }
  }

  // Resource / book search
  if (/\b(book|resource|title|author|isbn|material|copy|copies|available|catalog|do you have|look for|find)\b/i.test(message)) {
    return { tool: 'search_resources', query: extractSearchQuery(message) }
  }

  return { tool: 'general', query: message }
}

function extractSearchQuery(raw: string): string {
  const cleaned = raw
    .replace(/\b(search for|find|look for|do you have|check if|any books? (about|on|by)|books? by|book by|show me|locate|can you find)\b/gi, '')
    .replace(/\b(books?|resources?|materials?|copies?|available|the|a|an|please|title|author|isbn)\b/gi, '')
    .replace(/[?!]/g, '')
    .trim()
    .replace(/\s+/g, ' ')
  return cleaned || raw.trim()
}

function extractEntityQuery(raw: string): string {
  const cleaned = raw
    .replace(/\b(patron|member|student|faculty|user|borrower|who is|find|for|of|the|fines?|balance|owe|owes|information|info|about|check|what are|show me|look up|lookup)\b/gi, '')
    .replace(/[?!]/g, '')
    .trim()
    .replace(/\s+/g, ' ')
  return cleaned || raw.trim()
}

export async function executeTool(
  intent: DetectedIntent,
  institutionId: number,
): Promise<string | null> {
  try {
    switch (intent.tool) {
      case 'search_resources': {
        const results = await ResourceService.search(institutionId, intent.query)
        if (!results.length) return `No resources found matching "${intent.query}".`
        const lines = results.slice(0, 8).map((r, i) =>
          `${i + 1}. "${r.title}" by ${r.author}` +
          `${r.isbn ? ` | ISBN: ${r.isbn}` : ''}` +
          ` | ${r.available_copies}/${r.total_copies} copies available` +
          `${r.call_number ? ` | Call No: ${r.call_number}` : ''}` +
          `${r.genre ? ` | Genre: ${r.genre}` : ''}`,
        )
        return (
          `Search results for "${intent.query}" (${results.length} found):\n` +
          lines.join('\n') +
          (results.length > 8 ? `\n...and ${results.length - 8} more results` : '')
        )
      }

      case 'get_patron_info': {
        if (!intent.query.trim()) return 'Please specify a patron name or ID number to look up.'
        const users = await UserService.search(institutionId, intent.query)
        if (!users.length) return `No patron found matching "${intent.query}".`
        const u = users[0]
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
        if (!intent.query.trim()) {
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
        const users = await UserService.search(institutionId, intent.query)
        if (!users.length) return `No patron found matching "${intent.query}".`
        const u = users[0]
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
        return null
    }
  } catch (e) {
    console.error(`[LibraryTools] Tool "${intent.tool}" failed:`, e)
    return null
  }
}
