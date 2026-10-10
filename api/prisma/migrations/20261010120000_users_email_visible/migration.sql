-- Emails in NFC with no control or invisible formatting characters (spec 0004 E47), so a zero-width
-- space or a decomposed letter cannot make a second account with the same visible address. The
-- class lists the control characters (Cc) and every format character (Cf, Unicode 17) by code
-- point, the same set the api refuses with \p{Cc}\p{Cf}, so the rule does not depend on the
-- locale. Written as ARE escapes (`\xhhh`, any number of hex digits) so the file stays ASCII: the
-- characters themselves are invisible in a diff. Replaced in one statement: the table never holds a
-- row without the check.

-- AlterCheck
ALTER TABLE "users"
    DROP CONSTRAINT "users_email_check",
    ADD CONSTRAINT "users_email_check" CHECK (
        email = lower(email)
        AND char_length(email) <= 254
        AND email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'
        AND email IS NFC NORMALIZED
        AND email !~ (
            '[\x01-\x1F\x7F-\x9F\xAD\x600-\x605\x61C\x6DD\x70F\x890-\x891\x8E2\x180E'
            || '\x200B-\x200F\x202A-\x202E\x2060-\x2064\x2066-\x206F\xFEFF\xFFF9-\xFFFB'
            || '\x110BD\x110CD\x13430-\x1343F\x1BCA0-\x1BCA3\x1D173-\x1D17A\xE0001\xE0020-\xE007F]'
        )
    );
