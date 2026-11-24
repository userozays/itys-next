-- Technicians could read license keys before roles were split; they keep that.
UPDATE `users` SET `can_see_license_keys` = 1 WHERE `role` = 'technician';
