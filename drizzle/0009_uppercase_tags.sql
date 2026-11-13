-- QA O4: device tags are stored in capitals from now on. Existing lower-case
-- tags are converted, except where the capitalised tag is already taken in
-- the same company; those stay as they are and keep working.
UPDATE `assets`
SET `tag` = upper(`tag`)
WHERE `tag` <> upper(`tag`)
  AND NOT EXISTS (
    SELECT 1 FROM `assets` AS `other`
    WHERE `other`.`company_id` = `assets`.`company_id` AND `other`.`tag` = upper(`assets`.`tag`)
  );
