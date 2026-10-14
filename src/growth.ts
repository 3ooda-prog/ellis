// Companion growth (evolution). Points come only from real use, so a
// companion grows as Ellis actually becomes useful:
//   2 per memory it saved that is still kept (not a guess, not deleted)
//   3 per task finished, 3 per decision recorded
//   5 per distinct day you talked with it
// Stage only changes when the user accepts an evolution (see /evolve).

import type { Queryable } from "./db/index.js";

export const STAGE_THRESHOLDS: Record<2 | 3, number> = { 2: 60, 3: 240 };

export interface Growth {
  points: number;
  stage: number;
  /** Points needed for the next stage, or null at the final stage. */
  next_at: number | null;
  /** Points at which the current stage began, for progress bars. */
  stage_start: number;
  /** Enough points to evolve, and the user has not chosen to keep this form. */
  ready: boolean;
  keep_form: boolean;
}

export function growthFrom(points: number, stage: number, keepForm: boolean): Growth {
  const next = stage < 3 ? STAGE_THRESHOLDS[(stage + 1) as 2 | 3] : null;
  const start = stage === 1 ? 0 : STAGE_THRESHOLDS[stage as 2 | 3];
  return {
    points,
    stage,
    next_at: next,
    stage_start: start,
    ready: next !== null && points >= next && !keepForm,
    keep_form: keepForm,
  };
}

export async function companionGrowth(q: Queryable, userId: string, companionId: string): Promise<Growth | null> {
  const { rows } = await q.query<{ stage: number; keep_form: boolean; points: number }>(
    `select c.stage, c.keep_form,
       (2 * (select count(*) from records r
              where r.user_id = $1 and r.created_by_companion_id = c.id
                and r.status in ('active', 'done', 'superseded') and r.confidence = 'explicit')
      + 3 * (select count(*) from records r
              where r.user_id = $1 and r.created_by_companion_id = c.id and r.status = 'done' and r.kind = 'task')
      + 3 * (select count(*) from records r
              where r.user_id = $1 and r.created_by_companion_id = c.id and r.kind = 'decision'
                and r.status in ('active', 'done', 'superseded'))
      + 5 * (select count(distinct (t.created_at at time zone u.timezone)::date)
               from turns t join conversations cv on cv.id = t.conversation_id
              where cv.user_id = $1 and cv.companion_id = c.id and t.role = 'user')
       )::int as points
       from companions c join users u on u.id = c.user_id
      where c.id = $2 and c.user_id = $1`,
    [userId, companionId],
  );
  const r = rows[0];
  return r ? growthFrom(r.points, r.stage, r.keep_form) : null;
}
