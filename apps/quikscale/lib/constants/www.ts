/**
 * WWW-module display constants.
 */

/**
 * Label shown wherever a WWW item's due date would render but the item is
 * flagged `dueDateTBD`.
 *
 * Such rows still carry a placeholder `when` in the database (so the column can
 * stay NOT NULL and every existing sort / index keeps working), which means the
 * raw date is meaningless to a reader. Every surface that prints a due date must
 * branch on the flag and show this instead.
 */
export const WWW_TBD_LABEL = "To be decided";
