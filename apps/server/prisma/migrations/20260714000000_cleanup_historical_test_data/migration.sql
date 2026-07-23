-- Repair two known historical test accounts whose nicknames were stored as question marks.
UPDATE "User"
SET "nickname" = '回归测试读者'
WHERE "email" = 'reader_1782817750241@example.com'
  AND "nickname" = '????';

UPDATE "User"
SET "nickname" = '界面测试用户'
WHERE "email" = 'ui_1782818651561@example.com'
  AND "nickname" = '????';

-- Remove unused tags left behind by historical UI tests so they no longer appear as filters.
DELETE FROM "Tag" AS tag
WHERE tag."name" IN ('??', '???', 'test', 'workbench')
  AND NOT EXISTS (
    SELECT 1
    FROM "_NovelTags" AS novel_tag
    WHERE novel_tag."B" = tag."id"
  );
