-- CreateIndex
CREATE INDEX `carousel_items_show_on_main_order_idx` ON `carousel_items`(`show_on_main`, `order`);

-- CreateIndex
CREATE INDEX `carousel_items_department_id_order_idx` ON `carousel_items`(`department_id`, `order`);

-- CreateIndex
CREATE INDEX `posts_department_id_created_at_idx` ON `posts`(`department_id`, `created_at`);

-- CreateIndex
CREATE INDEX `downloads_department_id_directory_idx` ON `downloads`(`department_id`, `directory`);

-- CreateIndex
CREATE INDEX `hero_sections_department_id_is_active_order_idx` ON `hero_sections`(`department_id`, `is_active`, `order`);
