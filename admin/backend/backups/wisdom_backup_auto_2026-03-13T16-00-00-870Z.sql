-- WISDOM Database Backup
-- Generated: 2026-03-13T16:00:00.871Z

SET FOREIGN_KEY_CHECKS=0;
SET SQL_MODE="NO_AUTO_VALUE_ON_ZERO";

DROP TABLE IF EXISTS `appointments`;
CREATE TABLE `appointments` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `order_id` int(11) DEFAULT NULL,
  `assigned_to` int(11) DEFAULT NULL,
  `purpose` varchar(200) DEFAULT NULL,
  `scheduled_date` datetime DEFAULT NULL,
  `preferred_date` datetime DEFAULT NULL,
  `status` enum('pending','confirmed','done','cancelled') DEFAULT 'pending',
  `notes` text DEFAULT NULL,
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `order_id` (`order_id`),
  KEY `assigned_to` (`assigned_to`),
  CONSTRAINT `appointments_ibfk_1` FOREIGN KEY (`order_id`) REFERENCES `orders` (`id`),
  CONSTRAINT `appointments_ibfk_2` FOREIGN KEY (`assigned_to`) REFERENCES `users` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

DROP TABLE IF EXISTS `audit_logs`;
CREATE TABLE `audit_logs` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `user_id` int(11) DEFAULT NULL,
  `action` varchar(100) DEFAULT NULL,
  `table_name` varchar(100) DEFAULT NULL,
  `record_id` int(11) DEFAULT NULL,
  `old_values` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (json_valid(`old_values`)),
  `new_values` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (json_valid(`new_values`)),
  `ip_address` varchar(45) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `user_id` (`user_id`),
  CONSTRAINT `audit_logs_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

DROP TABLE IF EXISTS `backup_logs`;
CREATE TABLE `backup_logs` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `type` enum('auto','manual') DEFAULT 'auto',
  `triggered_by` int(11) DEFAULT NULL,
  `file_name` varchar(255) DEFAULT NULL,
  `file_size_kb` int(11) DEFAULT NULL,
  `storage_path` text DEFAULT NULL,
  `status` enum('success','failed') DEFAULT 'success',
  `notes` text DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `triggered_by` (`triggered_by`),
  CONSTRAINT `backup_logs_ibfk_1` FOREIGN KEY (`triggered_by`) REFERENCES `users` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=4 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

INSERT INTO `backup_logs` (`id`, `type`, `triggered_by`, `file_name`, `file_size_kb`, `storage_path`, `status`, `notes`, `created_at`) VALUES
(1, 'auto', NULL, 'wisdom_backup_auto_2026-03-09T16-00-00-136Z.sql', 29, 'C:\\xamppnewwwww\\htdocs\\WISDOM\\backend\\backups\\wisdom_backup_auto_2026-03-09T16-00-00-136Z.sql', 'success', NULL, '2026-03-09 16:00:00'),
(2, 'manual', 2, 'wisdom_backup_manual_2026-03-10T14-26-11-088Z.sql', 36, 'C:\\xamppnewwwww\\htdocs\\WISDOM\\backend\\backups\\wisdom_backup_manual_2026-03-10T14-26-11-088Z.sql', 'success', NULL, '2026-03-10 14:26:11'),
(3, 'auto', NULL, 'wisdom_backup_auto_2026-03-12T16-00-01-000Z.sql', 36, 'C:\\xamppnewwwww\\htdocs\\WISDOM\\backend\\backups\\wisdom_backup_auto_2026-03-12T16-00-01-000Z.sql', 'success', NULL, '2026-03-12 16:00:01');

DROP TABLE IF EXISTS `bill_of_materials`;
CREATE TABLE `bill_of_materials` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `product_id` int(11) NOT NULL,
  `raw_material_id` int(11) NOT NULL,
  `quantity` decimal(10,2) DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `product_id` (`product_id`),
  KEY `raw_material_id` (`raw_material_id`),
  CONSTRAINT `bill_of_materials_ibfk_1` FOREIGN KEY (`product_id`) REFERENCES `products` (`id`) ON DELETE CASCADE,
  CONSTRAINT `bill_of_materials_ibfk_2` FOREIGN KEY (`raw_material_id`) REFERENCES `raw_materials` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

DROP TABLE IF EXISTS `blueprint_components`;
CREATE TABLE `blueprint_components` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `blueprint_id` int(11) NOT NULL,
  `component_type` varchar(100) DEFAULT NULL,
  `label` varchar(150) DEFAULT NULL,
  `width_mm` decimal(8,2) DEFAULT NULL,
  `height_mm` decimal(8,2) DEFAULT NULL,
  `depth_mm` decimal(8,2) DEFAULT NULL,
  `wood_type` varchar(100) DEFAULT NULL,
  `door_style` varchar(100) DEFAULT NULL,
  `hardware` varchar(150) DEFAULT NULL,
  `finish_color` varchar(100) DEFAULT NULL,
  `quantity` int(11) DEFAULT 1,
  `position_x` decimal(8,2) DEFAULT NULL,
  `position_y` decimal(8,2) DEFAULT NULL,
  `is_locked` tinyint(1) DEFAULT 0,
  `raw_material_id` int(11) DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `blueprint_id` (`blueprint_id`),
  KEY `raw_material_id` (`raw_material_id`),
  CONSTRAINT `blueprint_components_ibfk_1` FOREIGN KEY (`blueprint_id`) REFERENCES `blueprints` (`id`) ON DELETE CASCADE,
  CONSTRAINT `blueprint_components_ibfk_2` FOREIGN KEY (`raw_material_id`) REFERENCES `raw_materials` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

DROP TABLE IF EXISTS `blueprint_revisions`;
CREATE TABLE `blueprint_revisions` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `blueprint_id` int(11) NOT NULL,
  `revision_number` int(11) DEFAULT 1,
  `stage_at_save` varchar(50) DEFAULT NULL,
  `revision_data` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (json_valid(`revision_data`)),
  `revised_by` int(11) DEFAULT NULL,
  `notes` text DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `blueprint_id` (`blueprint_id`),
  KEY `revised_by` (`revised_by`),
  CONSTRAINT `blueprint_revisions_ibfk_1` FOREIGN KEY (`blueprint_id`) REFERENCES `blueprints` (`id`),
  CONSTRAINT `blueprint_revisions_ibfk_2` FOREIGN KEY (`revised_by`) REFERENCES `users` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=5 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

INSERT INTO `blueprint_revisions` (`id`, `blueprint_id`, `revision_number`, `stage_at_save`, `revision_data`, `revised_by`, `notes`, `created_at`) VALUES
(1, 1, 1, 'design', NULL, 1, NULL, '2026-03-09 18:08:15'),
(2, 3, 1, 'design', NULL, 1, NULL, '2026-03-09 18:33:13'),
(3, 5, 1, 'design', NULL, 2, NULL, '2026-03-10 10:45:30'),
(4, 7, 1, 'design', NULL, 2, NULL, '2026-03-10 14:18:25');

DROP TABLE IF EXISTS `blueprints`;
CREATE TABLE `blueprints` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `title` varchar(200) NOT NULL,
  `description` text DEFAULT NULL,
  `creator_id` int(11) NOT NULL,
  `client_id` int(11) DEFAULT NULL,
  `stage` enum('design','estimation','approval','production','delivery','completed','archived') DEFAULT 'design',
  `design_data` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (json_valid(`design_data`)),
  `view_3d_data` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (json_valid(`view_3d_data`)),
  `locked_fields` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (json_valid(`locked_fields`)),
  `thumbnail_url` text DEFAULT NULL,
  `source` enum('created','imported') DEFAULT 'created',
  `file_url` text DEFAULT NULL,
  `file_type` varchar(10) DEFAULT NULL,
  `is_template` tinyint(1) DEFAULT 0,
  `is_gallery` tinyint(1) DEFAULT 0,
  `is_deleted` tinyint(1) DEFAULT 0,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `creator_id` (`creator_id`),
  KEY `client_id` (`client_id`),
  CONSTRAINT `blueprints_ibfk_1` FOREIGN KEY (`creator_id`) REFERENCES `users` (`id`),
  CONSTRAINT `blueprints_ibfk_2` FOREIGN KEY (`client_id`) REFERENCES `users` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=9 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

INSERT INTO `blueprints` (`id`, `title`, `description`, `creator_id`, `client_id`, `stage`, `design_data`, `view_3d_data`, `locked_fields`, `thumbnail_url`, `source`, `file_url`, `file_type`, `is_template`, `is_gallery`, `is_deleted`, `created_at`, `updated_at`) VALUES
(1, 'Room1', NULL, 1, NULL, 'archived', '{"components":[{"id":"c_1773079693769_gtr3","type":"base_cabinet","label":"Base Cabinet","x":60,"y":60,"z":60,"width":120,"height":100,"depth":80,"fill":"#bbf7d0","material":"Marine Plywood","unitPrice":9500,"qty":1,"locked":false}],"canvasSize":{"w":900,"h":580}}', NULL, NULL, NULL, 'created', NULL, NULL, 0, 0, 1, '2026-03-09 17:30:20', '2026-03-09 18:10:05'),
(2, 'Room2', NULL, 1, NULL, 'archived', NULL, NULL, NULL, NULL, 'created', NULL, NULL, 0, 0, 1, '2026-03-09 18:08:31', '2026-03-09 18:10:03'),
(3, 'Room1', NULL, 1, NULL, 'design', '{"components":[{"id":"c_1773080940328_ve0o","type":"upper_cabinet","label":"Upper Cabinet","x":120,"y":160,"z":400,"width":120,"height":100,"depth":60,"fill":"#bfdbfe","material":"Marine Plywood","unitPrice":8500,"qty":1,"locked":false}],"canvasSize":{"w":900,"h":580}}', NULL, NULL, NULL, 'created', NULL, NULL, 0, 0, 0, '2026-03-09 18:10:11', '2026-03-09 18:33:13'),
(4, 'Room2', NULL, 1, NULL, 'design', NULL, NULL, NULL, NULL, 'created', NULL, NULL, 0, 0, 0, '2026-03-09 18:12:51', '2026-03-09 18:12:51'),
(5, 'Room1', NULL, 2, NULL, 'archived', '{"components":[{"id":"c_1773139528858_arxg","type":"drawer","label":"Drawer","x":60,"y":60,"z":60,"width":100,"height":40,"depth":60,"fill":"#fde68a","material":"Plywood + Rail","unitPrice":3200,"qty":1,"locked":false},{"id":"c_1773139529194_7x4z","type":"base_cabinet","label":"Base Cabinet","x":100,"y":100,"z":100,"width":120,"height":100,"depth":80,"fill":"#bbf7d0","material":"Marine Plywood","unitPrice":9500,"qty":1,"locked":false},{"id":"c_1773139529378_z1qn","type":"base_cabinet","label":"Base Cabinet","x":140,"y":140,"z":140,"width":120,"height":100,"depth":80,"fill":"#bbf7d0","material":"Marine Plywood","unitPrice":9500,"qty":1,"locked":false}],"canvasSize":{"w":900,"h":580}}', NULL, NULL, NULL, 'created', NULL, NULL, 0, 0, 1, '2026-03-10 10:42:26', '2026-03-10 14:37:01'),
(6, '123', NULL, 2, NULL, 'archived', NULL, NULL, NULL, NULL, 'created', NULL, NULL, 0, 0, 1, '2026-03-10 13:57:53', '2026-03-10 14:36:59'),
(7, 'scddsfsaf', NULL, 2, NULL, 'archived', '{"components":[{"id":"c_1773152299985_upf7","type":"drawer","label":"Drawer","x":100,"y":500,"z":100,"width":100,"height":40,"depth":60,"fill":"#fde68a","material":"Plywood + Rail","unitPrice":3200,"qty":1,"locked":false},{"id":"c_1773152300225_tlty","type":"drawer","label":"Drawer","x":100,"y":500,"z":100,"width":100,"height":40,"depth":60,"fill":"#fde68a","material":"Plywood + Rail","unitPrice":3200,"qty":1,"locked":false},{"id":"c_1773152300777_lj1v","type":"upper_cabinet","label":"Upper Cabinet","x":80,"y":260,"z":80,"width":120,"height":80,"depth":60,"fill":"#bfdbfe","material":"Marine Plywood","unitPrice":8500,"qty":1,"locked":false},{"id":"c_1773152301081_s8yy","type":"door_single","label":"Door (Single)","x":80,"y":260,"z":140,"width":60,"height":80,"depth":20,"fill":"#ddd6fe","material":"Laminated Board","unitPrice":1800,"qty":1,"locked":false},{"id":"c_1773152301217_tpi2","type":"door_single","label":"Door (Single)","x":80,"y":260,"z":140,"width":60,"height":80,"depth":20,"fill":"#ddd6fe","material":"Laminated Board","unitPrice":1800,"qty":1,"locked":false},{"id":"c_1773152301537_w1pe","type":"door_single","label":"Door (Single)","x":80,"y":260,"z":140,"width":60,"height":80,"depth":20,"fill":"#ddd6fe","material":"Laminated Board","unitPrice":1800,"qty":1,"locked":false},{"id":"c_1773152301697_fabb","type":"door_single","label":"Door (Single)","x":80,"y":260,"z":140,"width":60,"height":80,"depth":20,"fill":"#ddd6fe","material":"Laminated Board","unitPrice":1800,"qty":1,"locked":false},{"id":"c_1773152301913_c7h8","type":"base_cabinet","label":"Base Cabinet","x":80,"y":440,"z":80,"width":120,"height":100,"depth":80,"fill":"#bbf7d0","material":"Marine Plywood","unitPrice":9500,"qty":1,"locked":false},{"id":"c_1773152302217_dz6c","type":"door_single","label":"Door (Single)","x":80,"y":260,"z":140,"width":60,"height":80,"depth":20,"fill":"#ddd6fe","material":"Laminated Board","unitPrice":1800,"qty":1,"locked":false},{"id":"c_1773152302833_bs1s","type":"drawer","label":"Drawer","x":100,"y":460,"z":100,"width":100,"height":40,"depth":60,"fill":"#fde68a","material":"Plywood + Rail","unitPrice":3200,"qty":1,"locked":false},{"id":"c_1773152303225_697m","type":"door_single","label":"Door (Single)","x":80,"y":260,"z":140,"width":60,"height":80,"depth":20,"fill":"#ddd6fe","material":"Laminated Board","unitPrice":1800,"qty":1,"locked":false},{"id":"c_1773152303385_sww2","type":"door_single","label":"Door (Single)","x":80,"y":260,"z":140,"width":60,"height":80,"depth":20,"fill":"#ddd6fe","material":"Laminated Board","unitPrice":1800,"qty":1,"locked":false},{"id":"c_1773152303569_9ive","type":"drawer","label":"Drawer","x":100,"y":460,"z":100,"width":100,"height":40,"depth":60,"fill":"#fde68a","material":"Plywood + Rail","unitPrice":3200,"qty":1,"locked":false},{"id":"c_1773152303785_1zvl","type":"base_cabinet","label":"Base Cabinet","x":220,"y":440,"z":80,"width":120,"height":100,"depth":80,"fill":"#bbf7d0","material":"Marine Plywood","unitPrice":9500,"qty":1,"locked":false}],"canvasSize":{"w":900,"h":580,"d":580}}', NULL, NULL, NULL, 'created', NULL, NULL, 0, 0, 1, '2026-03-10 14:13:47', '2026-03-10 14:36:57'),
(8, '1231', NULL, 2, NULL, 'design', NULL, NULL, NULL, NULL, 'imported', '/uploads/blueprints/1773153451579-959sxr444iv.pdf', 'pdf', 0, 0, 0, '2026-03-10 14:37:31', '2026-03-10 14:37:31');

DROP TABLE IF EXISTS `cancellations`;
CREATE TABLE `cancellations` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `order_id` int(11) NOT NULL,
  `requested_by` int(11) DEFAULT NULL,
  `reason` text DEFAULT NULL,
  `policy_applied` enum('full_refund','processing_fee','non_refundable','voided') DEFAULT NULL,
  `refund_amount` decimal(12,2) DEFAULT 0.00,
  `processing_fee` decimal(12,2) DEFAULT 0.00,
  `approved_by` int(11) DEFAULT NULL,
  `approved_at` datetime DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `order_id` (`order_id`),
  KEY `requested_by` (`requested_by`),
  KEY `approved_by` (`approved_by`),
  CONSTRAINT `cancellations_ibfk_1` FOREIGN KEY (`order_id`) REFERENCES `orders` (`id`),
  CONSTRAINT `cancellations_ibfk_2` FOREIGN KEY (`requested_by`) REFERENCES `users` (`id`),
  CONSTRAINT `cancellations_ibfk_3` FOREIGN KEY (`approved_by`) REFERENCES `users` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

DROP TABLE IF EXISTS `categories`;
CREATE TABLE `categories` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `name` varchar(100) NOT NULL,
  `type` enum('raw','build','blueprint') DEFAULT 'build',
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

DROP TABLE IF EXISTS `contracts`;
CREATE TABLE `contracts` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `blueprint_id` int(11) DEFAULT NULL,
  `order_id` int(11) DEFAULT NULL,
  `customer_id` int(11) DEFAULT NULL,
  `customer_name` varchar(200) DEFAULT NULL,
  `start_date` date DEFAULT NULL,
  `end_date` date DEFAULT NULL,
  `materials_used` text DEFAULT NULL,
  `warranty_terms` text DEFAULT NULL,
  `down_payment` decimal(12,2) DEFAULT 0.00,
  `processing_fee_pct` decimal(5,2) DEFAULT 15.00,
  `is_non_refundable` tinyint(1) DEFAULT 0,
  `authorized_by` int(11) DEFAULT NULL,
  `pdf_url` text DEFAULT NULL,
  `signed_at` datetime DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `customer_id` (`customer_id`),
  KEY `authorized_by` (`authorized_by`),
  CONSTRAINT `contracts_ibfk_1` FOREIGN KEY (`customer_id`) REFERENCES `users` (`id`),
  CONSTRAINT `contracts_ibfk_2` FOREIGN KEY (`authorized_by`) REFERENCES `users` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

DROP TABLE IF EXISTS `deliveries`;
CREATE TABLE `deliveries` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `order_id` int(11) NOT NULL,
  `driver_id` int(11) DEFAULT NULL,
  `scheduled_date` datetime DEFAULT NULL,
  `delivered_date` datetime DEFAULT NULL,
  `address` text DEFAULT NULL,
  `status` enum('scheduled','in_transit','delivered','failed') DEFAULT 'scheduled',
  `signed_receipt` text DEFAULT NULL,
  `notes` text DEFAULT NULL,
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `order_id` (`order_id`),
  KEY `driver_id` (`driver_id`),
  CONSTRAINT `deliveries_ibfk_1` FOREIGN KEY (`order_id`) REFERENCES `orders` (`id`),
  CONSTRAINT `deliveries_ibfk_2` FOREIGN KEY (`driver_id`) REFERENCES `users` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

DROP TABLE IF EXISTS `estimation_items`;
CREATE TABLE `estimation_items` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `estimation_id` int(11) NOT NULL,
  `component_id` int(11) DEFAULT NULL,
  `raw_material_id` int(11) DEFAULT NULL,
  `description` varchar(255) DEFAULT NULL,
  `quantity` decimal(10,2) DEFAULT NULL,
  `unit_cost` decimal(10,2) DEFAULT NULL,
  `subtotal` decimal(12,2) GENERATED ALWAYS AS (`quantity` * `unit_cost`) STORED,
  PRIMARY KEY (`id`),
  KEY `estimation_id` (`estimation_id`),
  KEY `component_id` (`component_id`),
  KEY `raw_material_id` (`raw_material_id`),
  CONSTRAINT `estimation_items_ibfk_1` FOREIGN KEY (`estimation_id`) REFERENCES `estimations` (`id`) ON DELETE CASCADE,
  CONSTRAINT `estimation_items_ibfk_2` FOREIGN KEY (`component_id`) REFERENCES `blueprint_components` (`id`),
  CONSTRAINT `estimation_items_ibfk_3` FOREIGN KEY (`raw_material_id`) REFERENCES `raw_materials` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

DROP TABLE IF EXISTS `estimations`;
CREATE TABLE `estimations` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `blueprint_id` int(11) NOT NULL,
  `version` int(11) DEFAULT 1,
  `material_cost` decimal(12,2) DEFAULT 0.00,
  `labor_cost` decimal(12,2) DEFAULT 0.00,
  `labor_breakdown` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (json_valid(`labor_breakdown`)),
  `tax` decimal(10,2) DEFAULT 0.00,
  `discount` decimal(10,2) DEFAULT 0.00,
  `grand_total` decimal(12,2) DEFAULT 0.00,
  `estimation_data` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (json_valid(`estimation_data`)),
  `status` enum('draft','sent','approved','rejected') DEFAULT 'draft',
  `pdf_url` text DEFAULT NULL,
  `approved_by` int(11) DEFAULT NULL,
  `approved_at` datetime DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `blueprint_id` (`blueprint_id`),
  KEY `approved_by` (`approved_by`),
  CONSTRAINT `estimations_ibfk_1` FOREIGN KEY (`blueprint_id`) REFERENCES `blueprints` (`id`),
  CONSTRAINT `estimations_ibfk_2` FOREIGN KEY (`approved_by`) REFERENCES `users` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

DROP TABLE IF EXISTS `faqs`;
CREATE TABLE `faqs` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `question` text NOT NULL,
  `answer` text NOT NULL,
  `sort_order` int(11) DEFAULT 0,
  `is_visible` tinyint(1) DEFAULT 1,
  `created_by` int(11) DEFAULT NULL,
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `created_by` (`created_by`),
  CONSTRAINT `faqs_ibfk_1` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

DROP TABLE IF EXISTS `notifications`;
CREATE TABLE `notifications` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `user_id` int(11) DEFAULT NULL,
  `type` varchar(50) DEFAULT NULL,
  `title` varchar(200) DEFAULT NULL,
  `message` text DEFAULT NULL,
  `is_read` tinyint(1) DEFAULT 0,
  `channel` enum('email','system','both') DEFAULT 'system',
  `sent_at` datetime DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `user_id` (`user_id`),
  CONSTRAINT `notifications_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

DROP TABLE IF EXISTS `order_items`;
CREATE TABLE `order_items` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `order_id` int(11) NOT NULL,
  `product_id` int(11) DEFAULT NULL,
  `variation_id` int(11) DEFAULT NULL,
  `product_name` varchar(200) DEFAULT NULL,
  `quantity` int(11) DEFAULT 1,
  `unit_price` decimal(10,2) DEFAULT NULL,
  `production_cost` decimal(10,2) DEFAULT NULL,
  `profit_margin` decimal(10,2) GENERATED ALWAYS AS (`unit_price` - `production_cost`) STORED,
  `subtotal` decimal(10,2) GENERATED ALWAYS AS (`quantity` * `unit_price`) STORED,
  PRIMARY KEY (`id`),
  KEY `order_id` (`order_id`),
  KEY `product_id` (`product_id`),
  KEY `variation_id` (`variation_id`),
  CONSTRAINT `order_items_ibfk_1` FOREIGN KEY (`order_id`) REFERENCES `orders` (`id`) ON DELETE CASCADE,
  CONSTRAINT `order_items_ibfk_2` FOREIGN KEY (`product_id`) REFERENCES `products` (`id`),
  CONSTRAINT `order_items_ibfk_3` FOREIGN KEY (`variation_id`) REFERENCES `product_variations` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

DROP TABLE IF EXISTS `orders`;
CREATE TABLE `orders` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `order_number` varchar(50) DEFAULT NULL,
  `customer_id` int(11) DEFAULT NULL,
  `walkin_customer_name` varchar(150) DEFAULT NULL,
  `walkin_customer_phone` varchar(20) DEFAULT NULL,
  `type` enum('online','walkin') DEFAULT 'online',
  `order_type` enum('standard','blueprint') DEFAULT 'standard',
  `status` enum('pending','confirmed','production','shipping','delivered','completed','cancelled') DEFAULT 'pending',
  `payment_method` enum('cash','gcash','bank_transfer','cod','cop') DEFAULT 'cash',
  `payment_status` enum('unpaid','partial','paid') DEFAULT 'unpaid',
  `subtotal` decimal(12,2) DEFAULT 0.00,
  `tax` decimal(10,2) DEFAULT 0.00,
  `discount` decimal(10,2) DEFAULT 0.00,
  `total` decimal(12,2) DEFAULT 0.00,
  `down_payment` decimal(12,2) DEFAULT 0.00,
  `payment_proof` text DEFAULT NULL,
  `delivery_address` text DEFAULT NULL,
  `notes` text DEFAULT NULL,
  `blueprint_id` int(11) DEFAULT NULL,
  `cancellation_reason` text DEFAULT NULL,
  `cancelled_at` datetime DEFAULT NULL,
  `refund_amount` decimal(12,2) DEFAULT 0.00,
  `refund_status` enum('none','pending','processed') DEFAULT 'none',
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `order_number` (`order_number`),
  KEY `customer_id` (`customer_id`),
  KEY `blueprint_id` (`blueprint_id`),
  CONSTRAINT `orders_ibfk_1` FOREIGN KEY (`customer_id`) REFERENCES `users` (`id`),
  CONSTRAINT `orders_ibfk_2` FOREIGN KEY (`blueprint_id`) REFERENCES `blueprints` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

DROP TABLE IF EXISTS `password_resets`;
CREATE TABLE `password_resets` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `user_id` int(11) NOT NULL,
  `token_hash` varchar(255) NOT NULL,
  `expires_at` datetime NOT NULL,
  `used` tinyint(1) DEFAULT 0,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `user_id` (`user_id`),
  CONSTRAINT `password_resets_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

DROP TABLE IF EXISTS `payment_transactions`;
CREATE TABLE `payment_transactions` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `order_id` int(11) NOT NULL,
  `amount` decimal(12,2) NOT NULL,
  `payment_method` enum('cash','gcash','bank_transfer','cod','cop') DEFAULT NULL,
  `proof_url` text DEFAULT NULL,
  `verified_by` int(11) DEFAULT NULL,
  `verified_at` datetime DEFAULT NULL,
  `status` enum('pending','verified','rejected') DEFAULT 'pending',
  `notes` text DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `order_id` (`order_id`),
  KEY `verified_by` (`verified_by`),
  CONSTRAINT `payment_transactions_ibfk_1` FOREIGN KEY (`order_id`) REFERENCES `orders` (`id`) ON DELETE CASCADE,
  CONSTRAINT `payment_transactions_ibfk_2` FOREIGN KEY (`verified_by`) REFERENCES `users` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

DROP TABLE IF EXISTS `product_variations`;
CREATE TABLE `product_variations` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `product_id` int(11) NOT NULL,
  `variation_type` varchar(50) DEFAULT NULL,
  `variation_value` varchar(100) DEFAULT NULL,
  `variation_name` varchar(100) DEFAULT NULL,
  `unit_cost` decimal(10,2) DEFAULT NULL,
  `selling_price` decimal(10,2) DEFAULT NULL,
  `profit_margin` decimal(10,2) GENERATED ALWAYS AS (`selling_price` - `unit_cost`) STORED,
  `stock` int(11) DEFAULT 0,
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `product_id` (`product_id`),
  CONSTRAINT `product_variations_ibfk_1` FOREIGN KEY (`product_id`) REFERENCES `products` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

DROP TABLE IF EXISTS `products`;
CREATE TABLE `products` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `barcode` varchar(100) DEFAULT NULL,
  `name` varchar(200) NOT NULL,
  `description` text DEFAULT NULL,
  `category_id` int(11) DEFAULT NULL,
  `type` enum('standard','blueprint') DEFAULT 'standard',
  `image_url` text DEFAULT NULL,
  `is_featured` tinyint(1) DEFAULT 0,
  `online_price` decimal(10,2) DEFAULT 0.00,
  `walkin_price` decimal(10,2) DEFAULT 0.00,
  `production_cost` decimal(10,2) DEFAULT 0.00,
  `profit_margin` decimal(10,2) GENERATED ALWAYS AS (`walkin_price` - `production_cost`) STORED,
  `stock` int(11) DEFAULT 0,
  `reorder_point` int(11) DEFAULT 0,
  `stock_status` enum('in_stock','low_stock','out_of_stock') DEFAULT 'in_stock',
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `barcode` (`barcode`),
  KEY `category_id` (`category_id`),
  CONSTRAINT `products_ibfk_1` FOREIGN KEY (`category_id`) REFERENCES `categories` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

DROP TABLE IF EXISTS `raw_materials`;
CREATE TABLE `raw_materials` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `name` varchar(150) NOT NULL,
  `category_id` int(11) DEFAULT NULL,
  `unit` varchar(30) DEFAULT NULL,
  `quantity` decimal(10,2) DEFAULT 0.00,
  `reorder_point` decimal(10,2) DEFAULT 0.00,
  `unit_cost` decimal(10,2) DEFAULT 0.00,
  `supplier_id` int(11) DEFAULT NULL,
  `stock_status` enum('in_stock','low_stock','out_of_stock') DEFAULT 'in_stock',
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `category_id` (`category_id`),
  KEY `supplier_id` (`supplier_id`),
  CONSTRAINT `raw_materials_ibfk_1` FOREIGN KEY (`category_id`) REFERENCES `categories` (`id`),
  CONSTRAINT `raw_materials_ibfk_2` FOREIGN KEY (`supplier_id`) REFERENCES `suppliers` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

DROP TABLE IF EXISTS `receipts`;
CREATE TABLE `receipts` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `order_id` int(11) NOT NULL,
  `receipt_number` varchar(50) DEFAULT NULL,
  `issued_to` varchar(200) DEFAULT NULL,
  `issued_by` int(11) DEFAULT NULL,
  `total_amount` decimal(12,2) DEFAULT NULL,
  `items_snapshot` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (json_valid(`items_snapshot`)),
  `signature_url` text DEFAULT NULL,
  `printed_at` datetime DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `order_id` (`order_id`),
  UNIQUE KEY `receipt_number` (`receipt_number`),
  KEY `issued_by` (`issued_by`),
  CONSTRAINT `receipts_ibfk_1` FOREIGN KEY (`order_id`) REFERENCES `orders` (`id`),
  CONSTRAINT `receipts_ibfk_2` FOREIGN KEY (`issued_by`) REFERENCES `users` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

DROP TABLE IF EXISTS `static_pages`;
CREATE TABLE `static_pages` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `slug` varchar(100) NOT NULL,
  `title` varchar(200) DEFAULT NULL,
  `content` longtext DEFAULT NULL,
  `is_visible` tinyint(1) DEFAULT 1,
  `updated_by` int(11) DEFAULT NULL,
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `slug` (`slug`),
  KEY `updated_by` (`updated_by`),
  CONSTRAINT `static_pages_ibfk_1` FOREIGN KEY (`updated_by`) REFERENCES `users` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=4 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

INSERT INTO `static_pages` (`id`, `slug`, `title`, `content`, `is_visible`, `updated_by`, `updated_at`) VALUES
(1, 'about_us', 'About Us', 'About Spiral Wood Services...', 1, NULL, '2026-03-09 14:48:26'),
(2, 'contact', 'Contact Us', 'Contact information...', 1, NULL, '2026-03-09 14:48:26'),
(3, 'faq', 'FAQ', '', 1, NULL, '2026-03-09 14:48:26');

DROP TABLE IF EXISTS `stock_movements`;
CREATE TABLE `stock_movements` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `material_id` int(11) DEFAULT NULL,
  `product_id` int(11) DEFAULT NULL,
  `type` enum('in','out','adjustment','return') DEFAULT 'in',
  `quantity` decimal(10,2) DEFAULT NULL,
  `supplier_id` int(11) DEFAULT NULL,
  `order_id` int(11) DEFAULT NULL,
  `order_item_id` int(11) DEFAULT NULL,
  `reference` varchar(100) DEFAULT NULL,
  `notes` text DEFAULT NULL,
  `created_by` int(11) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `supplier_id` (`supplier_id`),
  KEY `order_id` (`order_id`),
  KEY `order_item_id` (`order_item_id`),
  KEY `created_by` (`created_by`),
  CONSTRAINT `stock_movements_ibfk_1` FOREIGN KEY (`supplier_id`) REFERENCES `suppliers` (`id`),
  CONSTRAINT `stock_movements_ibfk_2` FOREIGN KEY (`order_id`) REFERENCES `orders` (`id`),
  CONSTRAINT `stock_movements_ibfk_3` FOREIGN KEY (`order_item_id`) REFERENCES `order_items` (`id`),
  CONSTRAINT `stock_movements_ibfk_4` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

DROP TABLE IF EXISTS `suppliers`;
CREATE TABLE `suppliers` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `name` varchar(150) NOT NULL,
  `address` text DEFAULT NULL,
  `contact_number` varchar(20) DEFAULT NULL,
  `email` varchar(150) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

DROP TABLE IF EXISTS `user_sessions`;
CREATE TABLE `user_sessions` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `user_id` int(11) NOT NULL,
  `token_hash` varchar(255) NOT NULL,
  `ip_address` varchar(45) DEFAULT NULL,
  `user_agent` text DEFAULT NULL,
  `expires_at` datetime NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `user_id` (`user_id`),
  CONSTRAINT `user_sessions_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

DROP TABLE IF EXISTS `users`;
CREATE TABLE `users` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `name` varchar(100) NOT NULL,
  `email` varchar(150) NOT NULL,
  `password` varchar(255) NOT NULL,
  `role` enum('admin','staff','customer') DEFAULT 'customer',
  `phone` varchar(20) DEFAULT NULL,
  `address` text DEFAULT NULL,
  `profile_photo` text DEFAULT NULL,
  `is_verified` tinyint(1) DEFAULT 0,
  `otp_code` varchar(10) DEFAULT NULL,
  `otp_expires` datetime DEFAULT NULL,
  `approval_status` enum('pending','approved','rejected') DEFAULT 'pending',
  `approved_by` int(11) DEFAULT NULL,
  `approved_at` datetime DEFAULT NULL,
  `is_active` tinyint(1) DEFAULT 1,
  `last_login` datetime DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `email` (`email`),
  KEY `approved_by` (`approved_by`),
  CONSTRAINT `users_ibfk_1` FOREIGN KEY (`approved_by`) REFERENCES `users` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=3 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

INSERT INTO `users` (`id`, `name`, `email`, `password`, `role`, `phone`, `address`, `profile_photo`, `is_verified`, `otp_code`, `otp_expires`, `approval_status`, `approved_by`, `approved_at`, `is_active`, `last_login`, `created_at`, `updated_at`) VALUES
(1, 'Administrator', 'admin@spiralwood.com', '$2a$12$faK/Nj9FrOUJzhTAMBOvOelsFuEHt3O6MuhVmYTWU7W/JTduaeiEW', 'admin', NULL, NULL, NULL, 1, NULL, NULL, 'approved', NULL, NULL, 1, '2026-03-09 14:53:23', '2026-03-09 14:48:26', '2026-03-10 10:39:52'),
(2, 'Admin 2', 'admin2@example.com', '$2a$12$tI8nnoXZlbQJtyl9AvCUIO8bhSL.vLlYAAgRUQ5uoZ309Oup3qLkC', 'admin', '09123456789', 'Bulacan', NULL, 1, NULL, NULL, 'approved', 1, '2026-03-10 10:38:18', 1, '2026-03-13 09:11:04', '2026-03-10 10:38:18', '2026-03-13 09:11:04');

DROP TABLE IF EXISTS `warranties`;
CREATE TABLE `warranties` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `order_id` int(11) DEFAULT NULL,
  `order_item_id` int(11) DEFAULT NULL,
  `customer_id` int(11) NOT NULL,
  `product_name` varchar(200) DEFAULT NULL,
  `reason` text DEFAULT NULL,
  `proof_url` text DEFAULT NULL,
  `warranty_expiry` date DEFAULT NULL,
  `status` enum('pending','approved','rejected','fulfilled') DEFAULT 'pending',
  `replacement_receipt` text DEFAULT NULL,
  `fulfilled_at` datetime DEFAULT NULL,
  `fulfilled_by` int(11) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `order_id` (`order_id`),
  KEY `order_item_id` (`order_item_id`),
  KEY `customer_id` (`customer_id`),
  KEY `fulfilled_by` (`fulfilled_by`),
  CONSTRAINT `warranties_ibfk_1` FOREIGN KEY (`order_id`) REFERENCES `orders` (`id`),
  CONSTRAINT `warranties_ibfk_2` FOREIGN KEY (`order_item_id`) REFERENCES `order_items` (`id`),
  CONSTRAINT `warranties_ibfk_3` FOREIGN KEY (`customer_id`) REFERENCES `users` (`id`),
  CONSTRAINT `warranties_ibfk_4` FOREIGN KEY (`fulfilled_by`) REFERENCES `users` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

DROP TABLE IF EXISTS `website_settings`;
CREATE TABLE `website_settings` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `setting_key` varchar(100) NOT NULL,
  `value` text DEFAULT NULL,
  `group_name` varchar(50) DEFAULT NULL,
  `updated_by` int(11) DEFAULT NULL,
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `setting_key` (`setting_key`),
  KEY `updated_by` (`updated_by`),
  CONSTRAINT `website_settings_ibfk_1` FOREIGN KEY (`updated_by`) REFERENCES `users` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=18 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

INSERT INTO `website_settings` (`id`, `setting_key`, `value`, `group_name`, `updated_by`, `updated_at`) VALUES
(1, 'site_logo', '', 'display', NULL, '2026-03-09 14:48:26'),
(2, 'site_name', 'Spiral Wood Services', 'display', NULL, '2026-03-09 14:48:26'),
(3, 'show_faq_section', 'true', 'display', NULL, '2026-03-09 14:48:26'),
(4, 'show_about_section', 'true', 'display', NULL, '2026-03-09 14:48:26'),
(5, 'business_address', '', 'display', NULL, '2026-03-09 14:48:26'),
(6, 'business_phone', '', 'display', NULL, '2026-03-09 14:48:26'),
(7, 'cod_enabled', 'true', 'payment', NULL, '2026-03-09 14:48:26'),
(8, 'cop_enabled', 'true', 'payment', NULL, '2026-03-09 14:48:26'),
(9, 'gcash_enabled', 'true', 'payment', NULL, '2026-03-09 14:48:26'),
(10, 'bank_transfer_enabled', 'true', 'payment', NULL, '2026-03-09 14:48:26'),
(11, 'gcash_number', '', 'payment', NULL, '2026-03-09 14:48:26'),
(12, 'bank_account_name', '', 'payment', NULL, '2026-03-09 14:48:26'),
(13, 'bank_account_number', '', 'payment', NULL, '2026-03-09 14:48:26'),
(14, 'email_footer', '', 'email', NULL, '2026-03-09 14:48:26'),
(15, 'checkout_note', '', 'email', NULL, '2026-03-09 14:48:26'),
(16, 'warranty_period_days', '365', 'policy', NULL, '2026-03-09 14:48:26'),
(17, 'cancellation_fee_pct', '15', 'policy', NULL, '2026-03-09 14:48:26');

SET FOREIGN_KEY_CHECKS=1;