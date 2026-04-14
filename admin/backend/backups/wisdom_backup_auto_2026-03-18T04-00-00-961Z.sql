-- WISDOM Database Backup
-- Generated: 2026-03-18T04:00:00.969Z

SET FOREIGN_KEY_CHECKS=0;
SET SQL_MODE="NO_AUTO_VALUE_ON_ZERO";

DROP TABLE IF EXISTS `appointments`;
CREATE TABLE `appointments` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `order_id` int(11) DEFAULT NULL,
  `customer_id` int(11) DEFAULT NULL,
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
  KEY `idx_appointments_customer` (`customer_id`),
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
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

INSERT INTO `backup_logs` (`id`, `type`, `triggered_by`, `file_name`, `file_size_kb`, `storage_path`, `status`, `notes`, `created_at`) VALUES
(1, 'auto', NULL, 'wisdom_backup_auto_2026-03-15T04-00-00-714Z.sql', 35, 'C:\\xamppnewwwww\\htdocs\\WISDOM\\backend\\backups\\wisdom_backup_auto_2026-03-15T04-00-00-714Z.sql', 'success', NULL, '2026-03-15 04:00:00');

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
) ENGINE=InnoDB AUTO_INCREMENT=11 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

INSERT INTO `blueprint_revisions` (`id`, `blueprint_id`, `revision_number`, `stage_at_save`, `revision_data`, `revised_by`, `notes`, `created_at`) VALUES
(9, 40, 1, 'design', '{"components":[],"unit":"mm"}', 5, NULL, '2026-03-17 00:53:09'),
(10, 40, 2, 'design', '{"components":[{"id":"c_1773708787535_v4wu99","groupId":"g_1773708787535_crz13k","groupLabel":"Wooden Dining Table 1","groupType":"assembly","partCode":"DT-TOP","category":"Furniture Parts","blueprintStyle":"part","type":"dt_top_panel","label":"Top Panel","x":200,"y":2400,"z":160,"width":1800,"height":40,"depth":900,"rotationX":0,"rotationY":0,"rotationZ":0,"fill":"#D8B68A","material":"Oak Wood","finish":"oak-natural","unitPrice":0,"qty":1,"groupTemplate":"template_dining_table","groupUnitPrice":16200,"locked":false},{"id":"c_1773708787535_pk2jxl","groupId":"g_1773708787535_crz13k","groupLabel":"Wooden Dining Table 1","groupType":"assembly","partCode":"DT-FL","category":"Furniture Parts","blueprintStyle":"part","type":"dt_leg","label":"Front Leg L","x":270,"y":2440,"z":230,"width":80,"height":720,"depth":80,"rotationX":0,"rotationY":0,"rotationZ":0,"fill":"#D8B68A","material":"Oak Wood","finish":"oak-natural","unitPrice":0,"qty":1,"groupTemplate":"template_dining_table","groupUnitPrice":16200,"locked":false},{"id":"c_1773708787535_cckt3n","groupId":"g_1773708787535_crz13k","groupLabel":"Wooden Dining Table 1","groupType":"assembly","partCode":"DT-FR","category":"Furniture Parts","blueprintStyle":"part","type":"dt_leg","label":"Front Leg R","x":1850,"y":2440,"z":230,"width":80,"height":720,"depth":80,"rotationX":0,"rotationY":0,"rotationZ":0,"fill":"#D8B68A","material":"Oak Wood","finish":"oak-natural","unitPrice":0,"qty":1,"groupTemplate":"template_dining_table","groupUnitPrice":16200,"locked":false},{"id":"c_1773708787535_5rf8jy","groupId":"g_1773708787535_crz13k","groupLabel":"Wooden Dining Table 1","groupType":"assembly","partCode":"DT-BL","category":"Furniture Parts","blueprintStyle":"part","type":"dt_leg","label":"Back Leg L","x":270,"y":2440,"z":910,"width":80,"height":720,"depth":80,"rotationX":0,"rotationY":0,"rotationZ":0,"fill":"#D8B68A","material":"Oak Wood","finish":"oak-natural","unitPrice":0,"qty":1,"groupTemplate":"template_dining_table","groupUnitPrice":16200,"locked":false},{"id":"c_1773708787536_68ulxn","groupId":"g_1773708787535_crz13k","groupLabel":"Wooden Dining Table 1","groupType":"assembly","partCode":"DT-BR","category":"Furniture Parts","blueprintStyle":"part","type":"dt_leg","label":"Back Leg R","x":1850,"y":2440,"z":910,"width":80,"height":720,"depth":80,"rotationX":0,"rotationY":0,"rotationZ":0,"fill":"#D8B68A","material":"Oak Wood","finish":"oak-natural","unitPrice":0,"qty":1,"groupTemplate":"template_dining_table","groupUnitPrice":16200,"locked":false},{"id":"c_1773708787536_y8c4c2","groupId":"g_1773708787535_crz13k","groupLabel":"Wooden Dining Table 1","groupType":"assembly","partCode":"DT-AF","category":"Furniture Parts","blueprintStyle":"part","type":"dt_apron_long","label":"Front Apron","x":350,"y":2440,"z":230,"width":1500,"height":90,"depth":25,"rotationX":0,"rotationY":0,"rotationZ":0,"fill":"#D8B68A","material":"Oak Wood","finish":"oak-natural","unitPrice":0,"qty":1,"groupTemplate":"template_dining_table","groupUnitPrice":16200,"locked":false},{"id":"c_1773708787536_j122u5","groupId":"g_1773708787535_crz13k","groupLabel":"Wooden Dining Table 1","groupType":"assembly","partCode":"DT-AR","category":"Furniture Parts","blueprintStyle":"part","type":"dt_apron_long","label":"Rear Apron","x":350,"y":2440,"z":965,"width":1500,"height":90,"depth":25,"rotationX":0,"rotationY":0,"rotationZ":0,"fill":"#D8B68A","material":"Oak Wood","finish":"oak-natural","unitPrice":0,"qty":1,"groupTemplate":"template_dining_table","groupUnitPrice":16200,"locked":false},{"id":"c_1773708787536_9lktdn","groupId":"g_1773708787535_crz13k","groupLabel":"Wooden Dining Table 1","groupType":"assembly","partCode":"DT-AL","category":"Furniture Parts","blueprintStyle":"part","type":"dt_apron_short","label":"Left Apron","x":270,"y":2440,"z":310,"width":25,"height":90,"depth":600,"rotationX":0,"rotationY":0,"rotationZ":0,"fill":"#D8B68A","material":"Oak Wood","finish":"oak-natural","unitPrice":0,"qty":1,"groupTemplate":"template_dining_table","groupUnitPrice":16200,"locked":false},{"id":"c_1773708787536_djnijl","groupId":"g_1773708787535_crz13k","groupLabel":"Wooden Dining Table 1","groupType":"assembly","partCode":"DT-AR2","category":"Furniture Parts","blueprintStyle":"part","type":"dt_apron_short","label":"Right Apron","x":1905,"y":2440,"z":310,"width":25,"height":90,"depth":600,"rotationX":0,"rotationY":0,"rotationZ":0,"fill":"#D8B68A","material":"Oak Wood","finish":"oak-natural","unitPrice":0,"qty":1,"groupTemplate":"template_dining_table","groupUnitPrice":16200,"locked":false}],"unit":"mm","editorMode":"editable","reference_file":null,"importDimensions":null,"worldSize":{"w":6400,"h":3200,"d":5200},"sheetSize":{"w":900,"h":580},"exportViews":["3d","front","back","left","right","top","exploded","materials"]}', 5, NULL, '2026-03-17 10:58:26');

DROP TABLE IF EXISTS `blueprints`;
CREATE TABLE `blueprints` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `title` varchar(200) NOT NULL,
  `description` text DEFAULT NULL,
  `base_price` decimal(12,2) DEFAULT 0.00,
  `wood_type` varchar(100) DEFAULT NULL,
  `creator_id` int(11) NOT NULL,
  `client_id` int(11) DEFAULT NULL,
  `assigned_staff_id` int(11) DEFAULT NULL,
  `assign_task_type` varchar(50) DEFAULT NULL,
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
  `archived_at` datetime DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `creator_id` (`creator_id`),
  KEY `client_id` (`client_id`),
  KEY `assigned_staff_id` (`assigned_staff_id`),
  CONSTRAINT `blueprints_ibfk_1` FOREIGN KEY (`creator_id`) REFERENCES `users` (`id`),
  CONSTRAINT `blueprints_ibfk_2` FOREIGN KEY (`client_id`) REFERENCES `users` (`id`),
  CONSTRAINT `blueprints_ibfk_3` FOREIGN KEY (`assigned_staff_id`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=43 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

INSERT INTO `blueprints` (`id`, `title`, `description`, `base_price`, `wood_type`, `creator_id`, `client_id`, `assigned_staff_id`, `assign_task_type`, `stage`, `design_data`, `view_3d_data`, `locked_fields`, `thumbnail_url`, `source`, `file_url`, `file_type`, `is_template`, `is_gallery`, `is_deleted`, `archived_at`, `created_at`, `updated_at`) VALUES
(40, '123', NULL, 0, NULL, 5, NULL, NULL, NULL, 'design', '{"components":[],"unit":"mm","editorMode":"editable","reference_file":null,"importDimensions":null,"worldSize":{"w":6400,"h":3200,"d":5200},"sheetSize":{"w":900,"h":580},"exportViews":["3d","front","back","left","right","top","exploded","materials"]}', NULL, NULL, NULL, 'created', NULL, NULL, 0, 0, 0, NULL, '2026-03-17 00:52:48', '2026-03-17 10:58:26'),
(41, '123', NULL, 0, NULL, 5, NULL, NULL, NULL, 'design', '{"components":[],"unit":"mm"}', NULL, NULL, NULL, 'created', NULL, NULL, 0, 0, 0, NULL, '2026-03-17 10:27:39', '2026-03-17 10:27:39'),
(42, '123', NULL, 0, NULL, 5, NULL, NULL, NULL, 'design', '{"components":[],"unit":"mm"}', NULL, NULL, NULL, 'created', NULL, NULL, 0, 0, 0, NULL, '2026-03-17 19:37:03', '2026-03-17 19:37:03');

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
) ENGINE=InnoDB AUTO_INCREMENT=4 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

INSERT INTO `categories` (`id`, `name`, `type`) VALUES
(1, 'Cabinets', '');

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
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

INSERT INTO `deliveries` (`id`, `order_id`, `driver_id`, `scheduled_date`, `delivered_date`, `address`, `status`, `signed_receipt`, `notes`, `updated_at`) VALUES
(1, 3, NULL, '2026-03-25 02:00:00', NULL, 'PDM, Marilao, Bulacan', 'scheduled', NULL, 'Please handle the Modern Walnut Cabinet with extra care. Call customer 30 mins before arrival.', '2026-03-18 01:56:36');

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
) ENGINE=InnoDB AUTO_INCREMENT=4 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

INSERT INTO `notifications` (`id`, `user_id`, `type`, `title`, `message`, `is_read`, `channel`, `sent_at`, `created_at`) VALUES
(1, 1, 'assignment', 'New Task Assigned', 'You have been assigned a new task: Install Walnut Cabinet on Site', 0, 'system', '2026-03-18 03:58:29', '2026-03-18 03:58:29'),
(2, 1, 'system', 'System Update', 'The new staff assignment module is now live and working perfectly.', 0, 'system', '2026-03-18 03:58:29', '2026-03-18 03:58:29'),
(3, 1, 'task_update', 'Task Accepted', 'Spiral Wood Staff has accepted the task: Install Walnut Cabinet on Site', 0, 'system', '2026-03-18 03:58:47', '2026-03-18 03:58:47');

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
) ENGINE=InnoDB AUTO_INCREMENT=3 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

INSERT INTO `order_items` (`id`, `order_id`, `product_id`, `variation_id`, `product_name`, `quantity`, `unit_price`, `production_cost`, `profit_margin`, `subtotal`) VALUES
(1, 3, 6, NULL, 'Modern Walnut Cabinet', 1, 12500, NULL, NULL, 12500),
(2, 3, 5, NULL, 'Classic Oak Cabinet', 1, 8500, NULL, NULL, 8500);

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
) ENGINE=InnoDB AUTO_INCREMENT=4 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

INSERT INTO `orders` (`id`, `order_number`, `customer_id`, `walkin_customer_name`, `walkin_customer_phone`, `type`, `order_type`, `status`, `payment_method`, `payment_status`, `subtotal`, `tax`, `discount`, `total`, `down_payment`, `payment_proof`, `delivery_address`, `notes`, `blueprint_id`, `cancellation_reason`, `cancelled_at`, `refund_amount`, `refund_status`, `created_at`, `updated_at`) VALUES
(3, 'SWS-20260311-3755', 4, 'John Marc Aquino', '09934391473', 'online', 'standard', 'completed', 'cod', 'unpaid', 21000, 0, 0, 21000, 0, NULL, 'PDM, Marilao, Bulacan', '', NULL, NULL, NULL, 0, 'none', '2026-03-11 11:42:25', '2026-03-18 01:16:35');

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
) ENGINE=InnoDB AUTO_INCREMENT=8 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

INSERT INTO `products` (`id`, `barcode`, `name`, `description`, `category_id`, `type`, `image_url`, `is_featured`, `online_price`, `walkin_price`, `production_cost`, `profit_margin`, `stock`, `reorder_point`, `stock_status`, `created_at`, `updated_at`) VALUES
(5, NULL, 'Classic Oak Cabinet', 'A sturdy and elegant oak wood cabinet with 3 shelves and smooth finish. Perfect for living rooms and offices.', 1, 'standard', 'uploads/products/cabinet-oak.jpeg', 1, 8500, 0, 4200, -4200, 19, 5, 'in_stock', '2026-03-10 15:16:41', '2026-03-11 11:42:25'),
(6, NULL, 'Modern Walnut Cabinet', 'Sleek modern design walnut cabinet with soft-close doors and adjustable shelving. Ideal for bedrooms.', 1, 'standard', 'uploads/products/cabinet-walnut.jpeg', 1, 12500, 0, 6800, -6800, 14, 5, 'in_stock', '2026-03-10 15:16:41', '2026-03-11 11:42:25'),
(7, NULL, 'Rustic Pine Cabinet', 'Handcrafted rustic pine wood cabinet with vintage hardware. Adds a warm natural feel to any room.', 1, 'standard', 'uploads/products/cabinet-pine.jpeg', 0, 6800, 0, 3500, -3500, 8, 5, 'low_stock', '2026-03-10 15:16:41', '2026-03-10 16:00:08');

DROP TABLE IF EXISTS `project_tasks`;
CREATE TABLE `project_tasks` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `order_id` int(11) DEFAULT NULL,
  `blueprint_id` int(11) DEFAULT NULL,
  `assigned_to` int(11) NOT NULL,
  `assigned_by` int(11) NOT NULL,
  `task_role` enum('Cabinet Maker','Installer','Delivery Personnel','Quality Inspector','Other') DEFAULT 'Other',
  `title` varchar(200) NOT NULL,
  `description` text DEFAULT NULL,
  `accepted_at` datetime DEFAULT NULL,
  `status` enum('pending','in_progress','completed','blocked') DEFAULT 'pending',
  `is_read` tinyint(1) DEFAULT 0,
  `due_date` datetime DEFAULT NULL,
  `completed_at` datetime DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=3 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

INSERT INTO `project_tasks` (`id`, `order_id`, `blueprint_id`, `assigned_to`, `assigned_by`, `task_role`, `title`, `description`, `accepted_at`, `status`, `is_read`, `due_date`, `completed_at`, `created_at`, `updated_at`) VALUES
(1, 3, NULL, 1, 1, 'Cabinet Maker', 'Build Modern Walnut Cabinet', 'Customer paid down payment. Priority build requiring precise measurements based on the digital blueprint.', NULL, 'pending', 1, '2026-03-25 04:00:00', NULL, '2026-03-18 02:02:15', '2026-03-18 02:48:02'),
(2, 3, NULL, 1, 1, 'Installer', 'Install Walnut Cabinet on Site', 'Please bring standard installation tools. Customer requested afternoon installation.', '2026-03-18 03:58:47', 'in_progress', 1, '2026-03-26 06:00:00', NULL, '2026-03-18 03:58:29', '2026-03-18 03:58:47');

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

DROP TABLE IF EXISTS `staff_users`;
CREATE TABLE `staff_users` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `name` varchar(100) NOT NULL,
  `email` varchar(150) NOT NULL,
  `password` varchar(255) NOT NULL,
  `role` varchar(50) DEFAULT 'staff',
  `phone` varchar(20) DEFAULT NULL,
  `is_active` tinyint(1) DEFAULT 1,
  `last_login` datetime DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `email` (`email`)
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

INSERT INTO `staff_users` (`id`, `name`, `email`, `password`, `role`, `phone`, `is_active`, `last_login`, `created_at`, `updated_at`) VALUES
(1, 'Spiral Wood Staff', 'staff@spiralwood.com', '$2a$12$OUPqInOvGiKEaLrieWFCM.fFoKj8eqHRzDif7LOh/AA0P7Ft1hrcm', 'staff', NULL, 1, '2026-03-18 01:59:47', '2026-03-18 01:26:48', '2026-03-18 01:59:47');

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
(1, 'about_us', 'About Us', 'About Spiral Wood Services...', 1, NULL, '2026-03-04 14:25:20'),
(2, 'contact', 'Contact Us', 'Contact information...', 1, NULL, '2026-03-04 14:25:20'),
(3, 'faq', 'FAQ', '', 1, NULL, '2026-03-04 14:25:20');

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
  `pending_email` varchar(150) DEFAULT NULL,
  `password` varchar(255) NOT NULL,
  `role` enum('admin','staff','customer') DEFAULT 'customer',
  `phone` varchar(20) DEFAULT NULL,
  `pending_phone` varchar(20) DEFAULT NULL,
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
) ENGINE=InnoDB AUTO_INCREMENT=6 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

INSERT INTO `users` (`id`, `name`, `email`, `pending_email`, `password`, `role`, `phone`, `pending_phone`, `address`, `profile_photo`, `is_verified`, `otp_code`, `otp_expires`, `approval_status`, `approved_by`, `approved_at`, `is_active`, `last_login`, `created_at`, `updated_at`) VALUES
(1, 'Administrator', 'admin@spiralwood.com', NULL, '$2a$12$OUPqInOvGiKEaLrieWFCM.fFoKj8eqHRzDif7LOh/AA0P7Ft1hrcm', 'admin', NULL, NULL, NULL, NULL, 1, NULL, NULL, 'approved', NULL, NULL, 1, '2026-03-18 00:43:58', '2026-03-04 14:25:19', '2026-03-18 00:43:58'),
(2, 'Robin Nicolas', 'robinnicolas032@gmail.com', NULL, '$2a$12$nOzbbfn7HNKmkjCRPikLEePxckfvgPJ6UHpejZPrNyHPSJvjXleou', 'customer', '09766574817', NULL, 'PDM, Marilao, Bulacan', NULL, 1, NULL, NULL, 'pending', NULL, NULL, 1, NULL, '2026-03-09 11:11:58', '2026-03-09 11:12:20'),
(3, 'John Marc Aquino', 'jmaquino@gmail.com', NULL, '$2a$12$yhvBW8VoieXCf./eIV66LuZABGJL/6QJkX6bp8lt7XQycIlaUm7V6', 'customer', '09766574817', NULL, 'PDM, Marilao, Bulacan', NULL, 0, '643057', '2026-03-09 12:13:47', 'pending', NULL, NULL, 1, NULL, '2026-03-09 11:58:47', '2026-03-09 11:58:47'),
(4, 'John Marc Aquino', 'baluktottite7@gmail.com', NULL, '$2a$12$RwUTafjoROc5lNgwUxQX7.tI3BC5tyP9sbfYwVg.m.KoKg7a4VftK', 'customer', '09934391473', NULL, 'PDM, Marilao, Bulacan', NULL, 1, NULL, NULL, 'approved', NULL, NULL, 1, '2026-03-18 00:41:39', '2026-03-09 11:59:07', '2026-03-18 00:41:39'),
(5, 'admin2', 'admin2@example.com', NULL, '$2y$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'admin', NULL, NULL, NULL, NULL, 1, NULL, NULL, 'approved', NULL, '2026-03-15 02:18:57', 1, '2026-03-17 18:47:44', '2026-03-15 02:18:57', '2026-03-17 18:47:44');

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
) ENGINE=InnoDB AUTO_INCREMENT=16 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

INSERT INTO `website_settings` (`id`, `setting_key`, `value`, `group_name`, `updated_by`, `updated_at`) VALUES
(1, 'site_logo', '', 'display', NULL, '2026-03-04 14:25:19'),
(2, 'site_name', 'Spiral Wood Services', 'display', NULL, '2026-03-04 14:25:19'),
(3, 'show_faq_section', 'true', 'display', NULL, '2026-03-04 14:25:19'),
(4, 'show_about_section', 'true', 'display', NULL, '2026-03-04 14:25:19'),
(5, 'cod_enabled', 'true', 'payment', NULL, '2026-03-04 14:25:19'),
(6, 'cop_enabled', 'true', 'payment', NULL, '2026-03-04 14:25:19'),
(7, 'gcash_enabled', 'true', 'payment', NULL, '2026-03-04 14:25:19'),
(8, 'bank_transfer_enabled', 'true', 'payment', NULL, '2026-03-04 14:25:19'),
(9, 'gcash_number', '', 'payment', NULL, '2026-03-04 14:25:19'),
(10, 'bank_account_name', '', 'payment', NULL, '2026-03-04 14:25:19'),
(11, 'bank_account_number', '', 'payment', NULL, '2026-03-04 14:25:19'),
(12, 'email_footer', '', 'email', NULL, '2026-03-04 14:25:19'),
(13, 'checkout_note', '', 'email', NULL, '2026-03-04 14:25:19'),
(14, 'warranty_period_days', '365', 'policy', NULL, '2026-03-04 14:25:19'),
(15, 'cancellation_fee_pct', '15', 'policy', NULL, '2026-03-04 14:25:19');

SET FOREIGN_KEY_CHECKS=1;