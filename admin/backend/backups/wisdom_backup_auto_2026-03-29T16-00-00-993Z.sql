-- WISDOM Database Backup
-- Generated: 2026-03-29T16:00:00.993Z

SET FOREIGN_KEY_CHECKS=0;
SET SQL_MODE="NO_AUTO_VALUE_ON_ZERO";

DROP TABLE IF EXISTS `appointments`;
CREATE TABLE `appointments` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `order_id` int(11) DEFAULT NULL,
  `customer_id` int(11) DEFAULT NULL,
  `handled_by` int(11) DEFAULT NULL,
  `provider_id` int(11) DEFAULT NULL,
  `request_owner_id` int(11) DEFAULT NULL,
  `purpose` varchar(200) DEFAULT NULL,
  `scheduled_date` datetime DEFAULT NULL,
  `preferred_date` datetime DEFAULT NULL,
  `status` enum('pending','confirmed','done','cancelled') DEFAULT 'pending',
  `notes` text DEFAULT NULL,
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `order_id` (`order_id`),
  KEY `assigned_to` (`request_owner_id`),
  KEY `idx_appointments_customer` (`customer_id`),
  CONSTRAINT `appointments_ibfk_1` FOREIGN KEY (`order_id`) REFERENCES `orders` (`id`),
  CONSTRAINT `appointments_ibfk_2` FOREIGN KEY (`request_owner_id`) REFERENCES `users` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=8 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

INSERT INTO `appointments` (`id`, `order_id`, `customer_id`, `handled_by`, `provider_id`, `request_owner_id`, `purpose`, `scheduled_date`, `preferred_date`, `status`, `notes`, `updated_at`) VALUES
(7, NULL, 7, 5, 5, 5, 'consultation', '2026-03-27 00:00:00', '2026-03-27 00:00:00', 'done', 'Project Description: 123
Contact: 09123456789
Address: Sample Address
Customer Notes: 123', '2026-03-24 14:28:37');

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
(1, 'auto', NULL, 'wisdom_backup_auto_2026-03-29T04-00-00-496Z.sql', 61, 'C:\\Users\\User\\Desktop\\Admin0\\WISDOM\\backend\\backups\\wisdom_backup_auto_2026-03-29T04-00-00-496Z.sql', 'success', NULL, '2026-03-29 04:00:00');

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
) ENGINE=InnoDB AUTO_INCREMENT=30 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

INSERT INTO `blueprint_revisions` (`id`, `blueprint_id`, `revision_number`, `stage_at_save`, `revision_data`, `revised_by`, `notes`, `created_at`) VALUES
(28, 19, 1, 'design', '{"components":[],"unit":"mm"}', 6, NULL, '2026-03-29 04:14:09'),
(29, 20, 1, 'design', '{"components":[],"unit":"mm"}', 6, NULL, '2026-03-29 05:24:39');

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
) ENGINE=InnoDB AUTO_INCREMENT=22 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

INSERT INTO `blueprints` (`id`, `title`, `description`, `base_price`, `wood_type`, `creator_id`, `client_id`, `assigned_staff_id`, `assign_task_type`, `stage`, `design_data`, `view_3d_data`, `locked_fields`, `thumbnail_url`, `source`, `file_url`, `file_type`, `is_template`, `is_gallery`, `is_deleted`, `archived_at`, `created_at`, `updated_at`) VALUES
(3, 'Wooden House Cabinet Blueprint', 'A pre-designed wooden house-style cabinet blueprint ready for custom production.', 0, NULL, 1, NULL, NULL, NULL, 'approval', NULL, NULL, NULL, 'uploads/products/wooden-house-blueprint.jpeg', 'created', NULL, NULL, 0, 1, 0, NULL, '2026-03-12 12:42:35', '2026-03-12 12:42:35'),
(19, '1', NULL, 0, NULL, 6, NULL, NULL, NULL, 'design', '{"components":[],"unit":"mm","traceObjects":[],"referenceCalibration":{"points":[],"realDistanceMm":0,"pixelsPerMm":0,"isCalibrated":false},"importComments":"","editorMode":"reference","reference_files":{"front":{"url":"/uploads/blueprints/1774757648934-7fumxqza6e6.png","type":"png","name":"front view.png","source":"imported"},"back":{"url":"/uploads/blueprints/1774757648944-ji9npep1nc.png","type":"png","name":"back view.png","source":"imported"},"left":{"url":"/uploads/blueprints/1774757648954-u9266xq2hn.png","type":"png","name":"left view.png","source":"imported"},"right":{"url":"/uploads/blueprints/1774757648967-abxpaamm07.png","type":"png","name":"right view.png","source":"imported"},"top":{"url":"/uploads/blueprints/1774757648978-901i8gg9gi.png","type":"png","name":"top view.png","source":"imported"}},"reference_file":{"url":"/uploads/blueprints/1774757648934-7fumxqza6e6.png","type":"png","name":"front view.png","source":"imported"}}', NULL, NULL, '/uploads/blueprints/1774757648934-7fumxqza6e6.png', 'imported', '/uploads/blueprints/1774757648934-7fumxqza6e6.png', 'png', 0, 0, 0, NULL, '2026-03-29 04:11:50', '2026-03-29 04:14:09'),
(20, '123', NULL, 0, NULL, 6, NULL, NULL, NULL, 'design', '{"components":[],"unit":"mm","traceObjects":[],"referenceCalibration":{"points":[],"realDistanceMm":0,"pixelsPerMm":0,"isCalibrated":false},"importComments":"","editorMode":"reference","reference_files":{"front":{"url":"/uploads/blueprints/1774761879109-339qm7pzlp7.png","type":"png","name":"front view.png","source":"imported"},"back":{"url":"/uploads/blueprints/1774761879124-6y0yylke13h.png","type":"png","name":"back view.png","source":"imported"},"left":{"url":"/uploads/blueprints/1774761879136-rpjdb0gpgt.png","type":"png","name":"left view.png","source":"imported"},"right":{"url":"/uploads/blueprints/1774761879157-e9n2be87p1.png","type":"png","name":"right view.png","source":"imported"},"top":{"url":"/uploads/blueprints/1774761879165-zex1usuzxlp.png","type":"png","name":"top view.png","source":"imported"}},"reference_file":{"url":"/uploads/blueprints/1774761879109-339qm7pzlp7.png","type":"png","name":"front view.png","source":"imported"}}', NULL, NULL, '/uploads/blueprints/1774761879109-339qm7pzlp7.png', 'imported', '/uploads/blueprints/1774761879109-339qm7pzlp7.png', 'png', 0, 0, 0, NULL, '2026-03-29 05:12:31', '2026-03-29 05:24:39'),
(21, '123', NULL, 0, NULL, 6, NULL, NULL, NULL, 'design', '{"components":[],"unit":"mm"}', NULL, NULL, NULL, 'created', NULL, NULL, 0, 0, 0, NULL, '2026-03-29 05:31:30', '2026-03-29 05:31:30');

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
) ENGINE=InnoDB AUTO_INCREMENT=5 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

INSERT INTO `contracts` (`id`, `blueprint_id`, `order_id`, `customer_id`, `customer_name`, `start_date`, `end_date`, `materials_used`, `warranty_terms`, `down_payment`, `processing_fee_pct`, `is_non_refundable`, `authorized_by`, `pdf_url`, `signed_at`, `created_at`, `updated_at`) VALUES
(1, NULL, 36, NULL, 'Rica', '2026-03-28 16:00:00', NULL, '1. SCOPE OF WORK
The contractor agrees to fabricate and deliver the custom woodwork as described in the approved blueprint and cost estimation attached to this contract.

2. PAYMENT TERMS
A down payment of 50% of the total contract price is required before fabrication begins. The remaining balance is due upon delivery and acceptance of the finished product.

3. DELIVERY & INSTALLATION
The estimated completion and delivery date will be agreed upon after the down payment is received. Delays caused by customer changes or force majeure will extend the timeline accordingly.

4. CHANGES & REVISIONS
Any changes to the approved design after fabrication has begun may incur additional charges and timeline adjustments, subject to mutual agreement.

5. OWNERSHIP
Ownership of the finished product transfers to the customer upon full payment of the contract price.

6. GOVERNING LAW
This contract shall be governed by the laws of the Republic of the Philippines.', 'This product is covered by a one (1) year warranty from the date of delivery against defects in materials and workmanship under normal use conditions.

Warranty does not cover damage caused by misuse, neglect, unauthorized modifications, or external causes such as accidents or natural disasters.

To file a warranty claim, contact Spiral Wood Services with proof of purchase and documentation of the defect.', 0, 15, 0, 6, NULL, NULL, '2026-03-29 05:34:26', '2026-03-29 05:34:26'),
(2, NULL, 34, NULL, '123', '2026-03-28 16:00:00', NULL, '1. SCOPE OF WORK
The contractor agrees to fabricate and deliver the custom woodwork as described in the approved blueprint and cost estimation attached to this contract.

2. PAYMENT TERMS
A down payment of 50% of the total contract price is required before fabrication begins. The remaining balance is due upon delivery and acceptance of the finished product.

3. DELIVERY & INSTALLATION
The estimated completion and delivery date will be agreed upon after the down payment is received. Delays caused by customer changes or force majeure will extend the timeline accordingly.

4. CHANGES & REVISIONS
Any changes to the approved design after fabrication has begun may incur additional charges and timeline adjustments, subject to mutual agreement.

5. OWNERSHIP
Ownership of the finished product transfers to the customer upon full payment of the contract price.

6. GOVERNING LAW
This contract shall be governed by the laws of the Republic of the Philippines.', 'This product is covered by a one (1) year warranty from the date of delivery against defects in materials and workmanship under normal use conditions.

Warranty does not cover damage caused by misuse, neglect, unauthorized modifications, or external causes such as accidents or natural disasters.

To file a warranty claim, contact Spiral Wood Services with proof of purchase and documentation of the defect.', 0, 15, 0, 6, NULL, NULL, '2026-03-29 11:34:05', '2026-03-29 11:34:05'),
(3, NULL, 29, NULL, 'jericho', '2026-03-28 16:00:00', NULL, '1. SCOPE OF WORK
The contractor agrees to fabricate and deliver the custom woodwork as described in the approved blueprint and cost estimation attached to this contract.

2. PAYMENT TERMS
A down payment of 50% of the total contract price is required before fabrication begins. The remaining balance is due upon delivery and acceptance of the finished product.

3. DELIVERY & INSTALLATION
The estimated completion and delivery date will be agreed upon after the down payment is received. Delays caused by customer changes or force majeure will extend the timeline accordingly.

4. CHANGES & REVISIONS
Any changes to the approved design after fabrication has begun may incur additional charges and timeline adjustments, subject to mutual agreement.

5. OWNERSHIP
Ownership of the finished product transfers to the customer upon full payment of the contract price.

6. GOVERNING LAW
This contract shall be governed by the laws of the Republic of the Philippines.', 'This product is covered by a one (1) year warranty from the date of delivery against defects in materials and workmanship under normal use conditions.

Warranty does not cover damage caused by misuse, neglect, unauthorized modifications, or external causes such as accidents or natural disasters.

To file a warranty claim, contact Spiral Wood Services with proof of purchase and documentation of the defect.', 0, 15, 0, 6, NULL, NULL, '2026-03-29 11:43:52', '2026-03-29 11:43:52'),
(4, NULL, 22, NULL, 'Jericho', '2026-03-28 16:00:00', NULL, '1. SCOPE OF WORK
The contractor agrees to fabricate and deliver the custom woodwork as described in the approved blueprint and cost estimation attached to this contract.

2. PAYMENT TERMS
A down payment of 50% of the total contract price is required before fabrication begins. The remaining balance is due upon delivery and acceptance of the finished product.

3. DELIVERY & INSTALLATION
The estimated completion and delivery date will be agreed upon after the down payment is received. Delays caused by customer changes or force majeure will extend the timeline accordingly.

4. CHANGES & REVISIONS
Any changes to the approved design after fabrication has begun may incur additional charges and timeline adjustments, subject to mutual agreement.

5. OWNERSHIP
Ownership of the finished product transfers to the customer upon full payment of the contract price.

6. GOVERNING LAW
This contract shall be governed by the laws of the Republic of the Philippines.', 'This product is covered by a one (1) year warranty from the date of delivery against defects in materials and workmanship under normal use conditions.

Warranty does not cover damage caused by misuse, neglect, unauthorized modifications, or external causes such as accidents or natural disasters.

To file a warranty claim, contact Spiral Wood Services with proof of purchase and documentation of the defect.', 0, 15, 0, 6, NULL, NULL, '2026-03-29 12:12:11', '2026-03-29 12:12:11');

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
) ENGINE=InnoDB AUTO_INCREMENT=12 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

INSERT INTO `deliveries` (`id`, `order_id`, `driver_id`, `scheduled_date`, `delivered_date`, `address`, `status`, `signed_receipt`, `notes`, `updated_at`) VALUES
(8, 3, 5, '2026-03-20 07:52:00', '2026-03-19 23:52:30', '2131', 'delivered', NULL, '312', '2026-03-20 07:52:30'),
(9, 4, 5, '2026-03-20 07:52:00', NULL, '213', 'scheduled', NULL, '123', '2026-03-20 07:52:41'),
(10, 11, 5, '2026-03-20 10:41:00', '2026-03-20 02:42:23', 'Saog Marilao', 'delivered', NULL, '213', '2026-03-20 10:42:23'),
(11, 27, NULL, '2026-03-25 12:03:00', '2026-03-22 10:06:11', 'Saog Marilao Bulacan', 'delivered', NULL, '123213', '2026-03-22 10:06:11');

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
) ENGINE=InnoDB AUTO_INCREMENT=43 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

INSERT INTO `order_items` (`id`, `order_id`, `product_id`, `variation_id`, `product_name`, `quantity`, `unit_price`, `production_cost`, `profit_margin`, `subtotal`) VALUES
(1, 3, 6, NULL, 'Modern Walnut Cabinet', 1, 12500, NULL, NULL, 12500),
(2, 3, 5, NULL, 'Classic Oak Cabinet', 1, 8500, NULL, NULL, 8500),
(3, 4, 10, NULL, 'POS Test Cabinet Premium', 1, 14500, 9100, 5400, 14500),
(4, 5, 8, NULL, 'POS Test Cabinet Small', 1, 8500, 4800, 3700, 8500),
(5, 6, 10, NULL, 'POS Test Cabinet Premium', 1, 14500, 9100, 5400, 14500),
(6, 7, 10, NULL, 'POS Test Cabinet Premium', 1, 14500, 9100, 5400, 14500),
(7, 8, 9, NULL, 'POS Test Cabinet Medium', 1, 11500, 6800, 4700, 11500),
(8, 9, 10, NULL, 'POS Test Cabinet Premium', 1, 14500, 9100, 5400, 14500),
(9, 10, 10, NULL, 'POS Test Cabinet Premium', 1, 14500, 9100, 5400, 14500),
(10, 11, 10, NULL, 'POS Test Cabinet Premium', 1, 14500, 9100, 5400, 14500),
(11, 12, 9, NULL, 'POS Test Cabinet Medium', 1, 11500, 6800, 4700, 11500),
(12, 13, 9, NULL, 'POS Test Cabinet Medium', 1, 11500, 6800, 4700, 11500),
(13, 14, 9, NULL, 'POS Test Cabinet Medium', 1, 11500, 6800, 4700, 11500),
(14, 15, 9, NULL, 'POS Test Cabinet Medium', 1, 11500, 6800, 4700, 11500),
(15, 16, 8, NULL, 'POS Test Cabinet Small', 1, 8500, 4800, 3700, 8500),
(16, 17, 8, NULL, 'POS Test Cabinet Small', 1, 8500, 4800, 3700, 8500),
(17, 18, 10, NULL, 'POS Test Cabinet Premium', 2, 14500, 9100, 5400, 29000),
(18, 19, 8, NULL, 'POS Test Cabinet Small', 12, 8500, 4800, 3700, 102000),
(19, 20, 9, NULL, 'POS Test Cabinet Medium', 1, 11500, 6800, 4700, 11500),
(20, 21, 7, NULL, 'Rustic Pine Cabinet', 8, 6800, 3500, 3300, 54400),
(21, 22, 6, NULL, 'Modern Walnut Cabinet', 1, 12500, 6800, 5700, 12500),
(22, 22, 9, NULL, 'POS Test Cabinet Medium', 1, 11500, 6800, 4700, 11500),
(23, 23, 6, NULL, 'Modern Walnut Cabinet', 1, 12500, 6800, 5700, 12500),
(24, 23, 5, NULL, 'Classic Oak Cabinet', 1, 8500, 4200, 4300, 8500),
(25, 24, 5, NULL, 'Classic Oak Cabinet', 1, 8500, 4200, 4300, 8500),
(26, 24, 6, NULL, 'Modern Walnut Cabinet', 1, 12500, 6800, 5700, 12500),
(27, 25, 5, NULL, 'Classic Oak Cabinet', 2, 8500, NULL, NULL, 17000),
(28, 25, 6, NULL, 'Modern Walnut Cabinet', 1, 12500, NULL, NULL, 12500),
(29, 26, 5, NULL, 'Classic Oak Cabinet', 1, 8500, NULL, NULL, 8500),
(30, 27, 5, NULL, 'Classic Oak Cabinet', 1, 8500, 4200, 4300, 8500),
(31, 27, 6, NULL, 'Modern Walnut Cabinet', 1, 12500, 6800, 5700, 12500),
(32, 27, 9, NULL, 'POS Test Cabinet Medium', 1, 11500, 6800, 4700, 11500),
(33, 28, 5, NULL, 'Classic Oak Cabinet', 2, 8500, NULL, NULL, 17000),
(34, 28, 6, NULL, 'Modern Walnut Cabinet', 1, 12500, NULL, NULL, 12500),
(35, 29, 9, NULL, 'POS Test Cabinet Medium', 2, 11500, 6800, 4700, 23000),
(36, 30, 9, NULL, 'POS Test Cabinet Medium', 1, 11500, 6800, 4700, 11500),
(40, 34, 9, NULL, 'POS Test Cabinet Medium', 1, 11500, 6800, 4700, 11500),
(41, 35, 5, NULL, 'Classic Oak Cabinet', 1, 8500, NULL, NULL, 8500),
(42, 36, 5, NULL, 'Classic Oak Cabinet', 1, 8500, 4200, 4300, 8500);

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
  `cash_received` decimal(10,2) DEFAULT NULL,
  `change` decimal(10,2) NOT NULL DEFAULT 0.00,
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
) ENGINE=InnoDB AUTO_INCREMENT=37 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

INSERT INTO `orders` (`id`, `order_number`, `customer_id`, `walkin_customer_name`, `walkin_customer_phone`, `type`, `order_type`, `status`, `payment_method`, `payment_status`, `subtotal`, `tax`, `discount`, `total`, `cash_received`, `change`, `down_payment`, `payment_proof`, `delivery_address`, `notes`, `blueprint_id`, `cancellation_reason`, `cancelled_at`, `refund_amount`, `refund_status`, `created_at`, `updated_at`) VALUES
(3, 'SWS-20260311-3755', 4, 'John Marc Aquino', '09934391473', 'online', 'standard', 'shipping', 'cod', 'unpaid', 21000, 0, 0, 21000, NULL, 0, 0, NULL, 'PDM, Marilao, Bulacan', '', NULL, NULL, NULL, 0, 'none', '2026-03-11 11:42:25', '2026-03-20 06:16:31'),
(4, 'WLK-20260320-7167', NULL, 'Jericho', '09530695310', 'walkin', 'standard', 'shipping', 'cash', 'paid', 14500, 0, 0, 14500, NULL, 0, 0, NULL, NULL, NULL, NULL, NULL, NULL, 0, 'none', '2026-03-20 04:22:19', '2026-03-20 07:07:55'),
(5, 'WLK-20260320-5850', NULL, 'jericho', '09530695310', 'walkin', 'standard', 'shipping', 'cash', 'paid', 8500, 0, 0, 8500, NULL, 0, 0, NULL, NULL, NULL, NULL, NULL, NULL, 0, 'none', '2026-03-20 04:29:05', '2026-03-20 07:24:13'),
(6, 'WLK-20260320-1338', NULL, '1`3123', '21321321321', 'walkin', 'standard', 'confirmed', 'gcash', 'paid', 14500, 0, 0, 14500, NULL, 0, 0, NULL, NULL, '123', NULL, NULL, NULL, 0, 'none', '2026-03-20 04:32:26', '2026-03-20 04:32:26'),
(7, 'WLK-20260320-3649', NULL, '12321', '213213', 'walkin', 'standard', 'confirmed', 'cash', 'paid', 14500, 0, 0, 14500, NULL, 0, 0, NULL, NULL, NULL, NULL, NULL, NULL, 0, 'none', '2026-03-20 04:32:42', '2026-03-20 04:32:42'),
(8, 'WLK-20260320-1512', NULL, 'jericho', '12321', 'walkin', 'standard', 'confirmed', 'cash', 'paid', 11500, 0, 0, 11500, NULL, 0, 0, NULL, NULL, NULL, NULL, NULL, NULL, 0, 'none', '2026-03-20 04:34:25', '2026-03-20 04:34:25'),
(9, 'WLK-20260320-1890', NULL, 'jericho', '0959182321', 'walkin', 'standard', 'confirmed', 'cash', 'paid', 14500, 0, 0, 14500, NULL, 0, 0, NULL, NULL, NULL, NULL, NULL, NULL, 0, 'none', '2026-03-20 04:37:06', '2026-03-20 04:37:06'),
(10, 'WLK-20260320-4937', NULL, 'jericho', '123123213', 'walkin', 'standard', 'confirmed', 'cash', 'paid', 14500, 0, 0, 14500, NULL, 0, 0, NULL, NULL, NULL, NULL, NULL, NULL, 0, 'none', '2026-03-20 04:38:21', '2026-03-20 04:38:21'),
(11, 'WLK-20260320-3448', NULL, 'Jericho', '084358731', 'walkin', 'standard', 'shipping', 'cash', 'paid', 14500, 0, 0, 14500, NULL, 0, 0, NULL, NULL, NULL, NULL, NULL, NULL, 0, 'none', '2026-03-20 04:45:30', '2026-03-20 10:41:49'),
(12, 'WLK-20260320-4970', NULL, '1312213', '352413231', 'walkin', 'standard', 'confirmed', 'cash', 'paid', 11500, 0, 0, 11500, NULL, 0, 0, NULL, NULL, NULL, NULL, NULL, NULL, 0, 'none', '2026-03-20 04:50:11', '2026-03-20 04:50:11'),
(13, 'WLK-20260320-5504', NULL, '123', '12321', 'walkin', 'standard', 'confirmed', 'cash', 'paid', 11500, 0, 0, 11500, NULL, 0, 0, NULL, NULL, NULL, NULL, NULL, NULL, 0, 'none', '2026-03-20 04:57:28', '2026-03-20 04:57:28'),
(14, 'WLK-20260320-5689', NULL, '213', '123213', 'walkin', 'standard', 'confirmed', 'cash', 'paid', 11500, 0, 0, 11500, 15000, 3500, 0, NULL, NULL, NULL, NULL, NULL, NULL, 0, 'none', '2026-03-20 04:58:18', '2026-03-20 04:58:18'),
(15, 'WLK-20260320-3693', NULL, '12321', '12321', 'walkin', 'standard', 'confirmed', 'cash', 'paid', 11500, 0, 0, 11500, 15000, 3500, 0, NULL, NULL, NULL, NULL, NULL, NULL, 0, 'none', '2026-03-20 05:05:47', '2026-03-20 05:05:47'),
(16, 'WLK-20260320-2797', NULL, 'mark', '12412321312', 'walkin', 'standard', 'confirmed', 'cash', 'paid', 8500, 0, 0, 8500, 15000, 6500, 0, NULL, NULL, NULL, NULL, NULL, NULL, 0, 'none', '2026-03-20 12:03:00', '2026-03-20 12:03:00'),
(17, 'WLK-20260320-9303', NULL, 'robin', '817238921', 'walkin', 'standard', 'confirmed', 'cash', 'paid', 8500, 0, 0, 8500, 15000, 6500, 0, NULL, NULL, NULL, NULL, NULL, NULL, 0, 'none', '2026-03-20 12:03:53', '2026-03-20 12:03:53'),
(18, 'WLK-20260320-5636', NULL, '123', '12321313', 'walkin', 'standard', 'confirmed', 'cash', 'paid', 29000, 0, 0, 29000, 150000, 121000, 0, NULL, NULL, NULL, NULL, NULL, NULL, 0, 'none', '2026-03-20 12:47:27', '2026-03-20 12:47:27'),
(19, 'WLK-20260320-3854', NULL, 'Jericho', '0951231123', 'walkin', 'standard', 'confirmed', 'cash', 'paid', 102000, 0, 0, 102000, 103000, 1000, 0, NULL, NULL, NULL, NULL, NULL, NULL, 0, 'none', '2026-03-20 13:40:05', '2026-03-20 13:40:05'),
(20, 'WLK-20260320-9229', NULL, 'jericho', '0958121', 'walkin', 'standard', 'confirmed', 'cash', 'paid', 11500, 0, 0, 11500, 12000, 500, 0, NULL, NULL, NULL, NULL, NULL, NULL, 0, 'none', '2026-03-20 13:42:10', '2026-03-20 13:42:10'),
(21, 'WLK-20260320-2465', NULL, 'Jericho', '09530695310', 'walkin', 'standard', 'confirmed', 'cash', 'paid', 54400, 0, 0, 54400, 60000, 5600, 0, NULL, NULL, NULL, NULL, NULL, NULL, 0, 'none', '2026-03-20 14:02:41', '2026-03-20 14:02:41'),
(22, 'WLK-20260320-6730', NULL, 'Jericho', '09530695310', 'walkin', 'standard', 'confirmed', 'cash', 'paid', 24000, 0, 0, 24000, 25000, 1000, 0, NULL, NULL, NULL, NULL, NULL, NULL, 0, 'none', '2026-03-20 14:04:37', '2026-03-20 14:04:37'),
(23, 'WLK-20260320-8384', NULL, 'Jericho', '09530695310', 'walkin', 'standard', 'confirmed', 'cash', 'paid', 21000, 0, 0, 21000, 24000, 3000, 0, NULL, NULL, NULL, NULL, NULL, NULL, 0, 'none', '2026-03-20 14:05:49', '2026-03-20 14:05:49'),
(24, 'WLK-20260320-6543', NULL, 'Jericho', '09530695310', 'walkin', 'standard', 'confirmed', 'cash', 'paid', 21000, 0, 0, 21000, 22000, 1000, 0, NULL, NULL, NULL, NULL, NULL, NULL, 0, 'none', '2026-03-20 14:06:17', '2026-03-20 14:06:17'),
(25, 'SWS-20260321-7750', 7, 'Sample Customer', '09123456789', 'online', 'standard', 'pending', 'cod', 'unpaid', 29500, 0, 0, 29500, NULL, 0, 0, NULL, 'Sample Address', '', NULL, NULL, NULL, 0, 'none', '2026-03-21 16:11:23', '2026-03-21 16:11:23'),
(26, 'SWS-20260322-4524', 7, 'Sample Customer', '09123456789', 'online', 'standard', 'pending', 'cod', 'unpaid', 8500, 0, 0, 8500, NULL, 0, 0, NULL, 'Sample Address', '', NULL, NULL, NULL, 0, 'none', '2026-03-22 09:57:08', '2026-03-22 09:57:08'),
(27, 'WLK-20260322-4669', NULL, 'aquino', '09530695310', 'walkin', 'standard', 'delivered', 'cash', 'paid', 32500, 0, 0, 32500, 33000, 500, 0, NULL, NULL, NULL, NULL, NULL, NULL, 0, 'none', '2026-03-22 10:02:44', '2026-03-22 10:06:11'),
(28, 'SWS-20260322-3082', 7, 'Sample Customer', '09123456789', 'online', 'standard', 'pending', 'cod', 'unpaid', 29500, 0, 0, 29500, NULL, 0, 0, NULL, 'Sample Address', '', NULL, NULL, NULL, 0, 'none', '2026-03-22 16:50:59', '2026-03-22 16:50:59'),
(29, 'WLK-20260323-9289', NULL, 'jericho', '09530695310', 'walkin', 'standard', 'confirmed', 'cash', 'paid', 23000, 0, 0, 23000, NULL, 0, 0, NULL, NULL, NULL, NULL, NULL, NULL, 0, 'none', '2026-03-23 14:11:48', '2026-03-23 14:11:48'),
(30, 'WLK-20260323-8594', NULL, 'Robin', '09530695310', 'walkin', 'standard', 'confirmed', 'cash', 'paid', 11500, 0, 0, 11500, NULL, 0, 0, NULL, NULL, NULL, NULL, NULL, NULL, 0, 'none', '2026-03-23 14:30:09', '2026-03-23 14:30:09'),
(34, 'WLK-20260323-8541', NULL, '123', '09812371222', 'walkin', 'standard', 'confirmed', 'cash', 'paid', 11500, 0, 0, 11500, NULL, 0, 0, NULL, NULL, NULL, NULL, NULL, NULL, 0, 'none', '2026-03-23 14:41:04', '2026-03-23 14:41:04'),
(35, 'SWS-20260323-6120', 7, 'Sample Customer', '09123456789', 'online', 'standard', 'pending', 'cod', 'unpaid', 8500, 0, 0, 8500, NULL, 0, 0, NULL, 'Sample Address', '', NULL, NULL, NULL, 0, 'none', '2026-03-23 15:03:13', '2026-03-23 15:03:13'),
(36, 'WLK-20260324-5232', NULL, 'Rica', '09530695310', 'walkin', 'standard', 'confirmed', 'cash', 'paid', 8500, 0, 20, 8480, NULL, 0, 0, NULL, NULL, NULL, NULL, NULL, NULL, 0, 'none', '2026-03-24 11:44:40', '2026-03-24 11:44:40');

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
) ENGINE=InnoDB AUTO_INCREMENT=30 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

INSERT INTO `payment_transactions` (`id`, `order_id`, `amount`, `payment_method`, `proof_url`, `verified_by`, `verified_at`, `status`, `notes`, `created_at`) VALUES
(1, 4, 14500, 'cash', NULL, 5, '2026-03-20 04:22:19', 'verified', NULL, '2026-03-20 04:22:19'),
(2, 5, 8500, 'cash', NULL, 5, '2026-03-20 04:29:05', 'verified', NULL, '2026-03-20 04:29:05'),
(3, 6, 14500, 'gcash', NULL, 5, '2026-03-20 04:32:26', 'verified', NULL, '2026-03-20 04:32:26'),
(4, 7, 14500, 'cash', NULL, 5, '2026-03-20 04:32:42', 'verified', NULL, '2026-03-20 04:32:42'),
(5, 8, 11500, 'cash', NULL, 5, '2026-03-20 04:34:25', 'verified', NULL, '2026-03-20 04:34:25'),
(6, 9, 14500, 'cash', NULL, 5, '2026-03-20 04:37:06', 'verified', NULL, '2026-03-20 04:37:06'),
(7, 10, 14500, 'cash', NULL, 5, '2026-03-20 04:38:21', 'verified', NULL, '2026-03-20 04:38:21'),
(8, 11, 14500, 'cash', NULL, 5, '2026-03-20 04:45:30', 'verified', NULL, '2026-03-20 04:45:30'),
(9, 12, 11500, 'cash', NULL, 5, '2026-03-20 04:50:11', 'verified', NULL, '2026-03-20 04:50:11'),
(10, 13, 11500, 'cash', NULL, 5, '2026-03-20 04:57:28', 'verified', NULL, '2026-03-20 04:57:28'),
(11, 14, 11500, 'cash', NULL, 5, '2026-03-20 04:58:18', 'verified', NULL, '2026-03-20 04:58:18'),
(12, 15, 11500, 'cash', NULL, 5, '2026-03-20 05:05:47', 'verified', NULL, '2026-03-20 05:05:47'),
(13, 16, 8500, 'cash', NULL, 5, '2026-03-20 12:03:00', 'verified', NULL, '2026-03-20 12:03:00'),
(14, 17, 8500, 'cash', NULL, 5, '2026-03-20 12:03:53', 'verified', NULL, '2026-03-20 12:03:53'),
(15, 18, 29000, 'cash', NULL, 5, '2026-03-20 12:47:27', 'verified', NULL, '2026-03-20 12:47:27'),
(16, 19, 102000, 'cash', NULL, 5, '2026-03-20 13:40:05', 'verified', NULL, '2026-03-20 13:40:05'),
(17, 20, 11500, 'cash', NULL, 5, '2026-03-20 13:42:11', 'verified', NULL, '2026-03-20 13:42:11'),
(18, 21, 54400, 'cash', NULL, 5, '2026-03-20 14:02:41', 'verified', NULL, '2026-03-20 14:02:41'),
(19, 22, 24000, 'cash', NULL, 5, '2026-03-20 14:04:37', 'verified', NULL, '2026-03-20 14:04:37'),
(20, 23, 21000, 'cash', NULL, 5, '2026-03-20 14:05:49', 'verified', NULL, '2026-03-20 14:05:49'),
(21, 24, 21000, 'cash', NULL, 5, '2026-03-20 14:06:17', 'verified', NULL, '2026-03-20 14:06:17'),
(22, 27, 32500, 'cash', NULL, 5, '2026-03-22 10:02:44', 'verified', NULL, '2026-03-22 10:02:44'),
(23, 29, 23000, 'cash', NULL, 5, '2026-03-23 14:11:48', 'verified', NULL, '2026-03-23 14:11:48'),
(24, 30, 11500, 'cash', NULL, 5, '2026-03-23 14:30:09', 'verified', NULL, '2026-03-23 14:30:09'),
(28, 34, 11500, 'cash', NULL, 5, '2026-03-23 14:41:04', 'verified', NULL, '2026-03-23 14:41:04'),
(29, 36, 8480, 'cash', NULL, 5, '2026-03-24 11:44:40', 'verified', NULL, '2026-03-24 11:44:40');

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
) ENGINE=InnoDB AUTO_INCREMENT=11 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

INSERT INTO `products` (`id`, `barcode`, `name`, `description`, `category_id`, `type`, `image_url`, `is_featured`, `online_price`, `walkin_price`, `production_cost`, `profit_margin`, `stock`, `reorder_point`, `stock_status`, `created_at`, `updated_at`) VALUES
(5, NULL, 'Classic Oak Cabinet', 'A sturdy and elegant oak wood cabinet with 3 shelves and smooth finish. Perfect for living rooms and offices.', 1, 'standard', 'uploads/products/cabinet-oak.jpeg', 1, 8500, 8500, 4200, 4300, 9, 5, 'in_stock', '2026-03-10 15:16:41', '2026-03-24 11:44:40'),
(6, NULL, 'Modern Walnut Cabinet', 'Sleek modern design walnut cabinet with soft-close doors and adjustable shelving. Ideal for bedrooms.', 1, 'standard', 'uploads/products/cabinet-walnut.jpeg', 1, 12500, 12500, 6800, 5700, 8, 5, 'in_stock', '2026-03-10 15:16:41', '2026-03-22 16:50:59'),
(7, NULL, 'Rustic Pine Cabinet', 'Handcrafted rustic pine wood cabinet with vintage hardware. Adds a warm natural feel to any room.', 1, 'standard', 'uploads/products/cabinet-pine.jpeg', 0, 6800, 6800, 3500, 3300, 0, 5, 'out_of_stock', '2026-03-10 15:16:41', '2026-03-20 14:02:41'),
(8, 'WDM-CAB-1001', 'POS Test Cabinet Small', 'Sample cabinet product for POS testing.', 1, 'standard', NULL, 0, 8500, 8500, 4800, 3700, 0, 5, 'out_of_stock', '2026-03-20 04:19:32', '2026-03-20 13:40:05'),
(9, 'WDM-CAB-1002', 'POS Test Cabinet Medium', 'Sample cabinet product for POS testing.', 1, 'standard', NULL, 0, 11500, 11500, 6800, 4700, 0, 5, 'out_of_stock', '2026-03-20 04:19:32', '2026-03-23 14:41:04'),
(10, 'WDM-CAB-1003', 'POS Test Cabinet Premium', 'Sample cabinet product for POS testing.', 1, 'standard', NULL, 1, 14500, 14500, 9100, 5400, 0, 3, 'out_of_stock', '2026-03-20 04:19:32', '2026-03-20 12:47:27');

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
  PRIMARY KEY (`id`),
  KEY `idx_project_tasks_order_id` (`order_id`),
  KEY `idx_project_tasks_blueprint_id` (`blueprint_id`),
  KEY `idx_project_tasks_assigned_to` (`assigned_to`),
  KEY `idx_project_tasks_assigned_by` (`assigned_by`),
  CONSTRAINT `fk_project_tasks_assigned_by` FOREIGN KEY (`assigned_by`) REFERENCES `users` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_project_tasks_assigned_to` FOREIGN KEY (`assigned_to`) REFERENCES `users` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_project_tasks_blueprint` FOREIGN KEY (`blueprint_id`) REFERENCES `blueprints` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_project_tasks_order` FOREIGN KEY (`order_id`) REFERENCES `orders` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

INSERT INTO `project_tasks` (`id`, `order_id`, `blueprint_id`, `assigned_to`, `assigned_by`, `task_role`, `title`, `description`, `accepted_at`, `status`, `is_read`, `due_date`, `completed_at`, `created_at`, `updated_at`) VALUES
(1, NULL, NULL, 5, 1, 'Cabinet Maker', 'Sample Task Assignment', 'Test task para lumabas sa Task Assignments page.', NULL, 'pending', 0, '2026-03-27 09:32:44', NULL, '2026-03-25 09:32:44', '2026-03-25 09:32:44');

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
) ENGINE=InnoDB AUTO_INCREMENT=3 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

INSERT INTO `raw_materials` (`id`, `name`, `category_id`, `unit`, `quantity`, `reorder_point`, `unit_cost`, `supplier_id`, `stock_status`, `created_at`, `updated_at`) VALUES
(1, 'Raw', NULL, '12', 2, 2, 20, 1, 'low_stock', '2026-03-21 15:00:31', '2026-03-21 15:00:31'),
(2, '123', NULL, '123', 4, 5, 10, 1, 'low_stock', '2026-03-26 14:18:35', '2026-03-26 14:18:35');

DROP TABLE IF EXISTS `receipts`;
CREATE TABLE `receipts` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `order_id` int(11) NOT NULL,
  `receipt_number` varchar(50) DEFAULT NULL,
  `issued_to` varchar(200) DEFAULT NULL,
  `issued_by` int(11) DEFAULT NULL,
  `total_amount` decimal(12,2) DEFAULT NULL,
  `cash_received` decimal(10,2) DEFAULT NULL,
  `change_amount` decimal(10,2) DEFAULT NULL,
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
) ENGINE=InnoDB AUTO_INCREMENT=27 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

INSERT INTO `receipts` (`id`, `order_id`, `receipt_number`, `issued_to`, `issued_by`, `total_amount`, `cash_received`, `change_amount`, `items_snapshot`, `signature_url`, `printed_at`, `created_at`) VALUES
(1, 4, 'OR-1773980539307', 'Jericho', 5, 14500, NULL, NULL, '[{"key":"10","product_id":10,"variation_id":null,"product_name":"POS Test Cabinet Premium","unit_price":14500,"production_cost":9100,"quantity":1,"max_stock":8}]', NULL, '2026-03-20 04:22:19', '2026-03-20 04:22:19'),
(2, 5, 'OR-1773980945434', 'jericho', 5, 8500, NULL, NULL, '[{"key":"8","product_id":8,"variation_id":null,"product_name":"POS Test Cabinet Small","unit_price":8500,"production_cost":4800,"quantity":1,"max_stock":15}]', NULL, '2026-03-20 04:29:05', '2026-03-20 04:29:05'),
(3, 6, 'OR-1773981146608', '1`3123', 5, 14500, NULL, NULL, '[{"key":"10","product_id":10,"variation_id":null,"product_name":"POS Test Cabinet Premium","unit_price":14500,"production_cost":9100,"quantity":1,"max_stock":7}]', NULL, '2026-03-20 04:32:26', '2026-03-20 04:32:26'),
(4, 7, 'OR-1773981162723', '12321', 5, 14500, NULL, NULL, '[{"key":"10","product_id":10,"variation_id":null,"product_name":"POS Test Cabinet Premium","unit_price":14500,"production_cost":9100,"quantity":1,"max_stock":6}]', NULL, '2026-03-20 04:32:42', '2026-03-20 04:32:42'),
(5, 8, 'OR-1773981265392', 'jericho', 5, 11500, NULL, NULL, '[{"key":"9","product_id":9,"variation_id":null,"product_name":"POS Test Cabinet Medium","unit_price":11500,"production_cost":6800,"quantity":1,"max_stock":12}]', NULL, '2026-03-20 04:34:25', '2026-03-20 04:34:25'),
(6, 9, 'OR-1773981426555', 'jericho', 5, 14500, NULL, NULL, '[{"key":"10","product_id":10,"variation_id":null,"product_name":"POS Test Cabinet Premium","unit_price":14500,"production_cost":9100,"quantity":1,"max_stock":5}]', NULL, '2026-03-20 04:37:06', '2026-03-20 04:37:06'),
(7, 10, 'OR-1773981501987', 'jericho', 5, 14500, NULL, NULL, '[{"key":"10","product_id":10,"variation_id":null,"product_name":"POS Test Cabinet Premium","unit_price":14500,"production_cost":9100,"quantity":1,"max_stock":4}]', NULL, '2026-03-20 04:38:21', '2026-03-20 04:38:21'),
(8, 11, 'OR-1773981930741', 'Jericho', 5, 14500, NULL, NULL, '[{"key":"10","product_id":10,"variation_id":null,"product_name":"POS Test Cabinet Premium","unit_price":14500,"production_cost":9100,"quantity":1,"max_stock":3}]', NULL, '2026-03-20 04:45:30', '2026-03-20 04:45:30'),
(9, 12, 'OR-1773982211373', '1312213', 5, 11500, NULL, NULL, '[{"key":"9","product_id":9,"variation_id":null,"product_name":"POS Test Cabinet Medium","unit_price":11500,"production_cost":6800,"quantity":1,"max_stock":11}]', NULL, '2026-03-20 04:50:11', '2026-03-20 04:50:11'),
(10, 13, 'OR-1773982648500', '123', 5, 11500, NULL, NULL, '[{"key":"9","product_id":9,"variation_id":null,"product_name":"POS Test Cabinet Medium","unit_price":11500,"production_cost":6800,"quantity":1,"max_stock":10}]', NULL, '2026-03-20 04:57:28', '2026-03-20 04:57:28'),
(11, 14, 'OR-1773982698977', '213', 5, 11500, NULL, NULL, '[{"product_id":9,"variation_id":null,"product_name":"POS Test Cabinet Medium","quantity":1,"unit_price":11500,"production_cost":6800}]', NULL, '2026-03-20 04:58:18', '2026-03-20 04:58:18'),
(12, 15, 'OR-1773983147102', '12321', 5, 11500, NULL, NULL, '[{"product_id":9,"variation_id":null,"product_name":"POS Test Cabinet Medium","quantity":1,"unit_price":11500,"production_cost":6800}]', NULL, '2026-03-20 05:05:47', '2026-03-20 05:05:47'),
(13, 16, 'OR-1774008180119', 'mark', 5, 8500, NULL, NULL, '[{"product_id":8,"variation_id":null,"product_name":"POS Test Cabinet Small","quantity":1,"unit_price":8500,"production_cost":4800}]', NULL, '2026-03-20 12:03:00', '2026-03-20 12:03:00'),
(14, 17, 'OR-1774008233543', 'robin', 5, 8500, NULL, NULL, '[{"product_id":8,"variation_id":null,"product_name":"POS Test Cabinet Small","quantity":1,"unit_price":8500,"production_cost":4800}]', NULL, '2026-03-20 12:03:53', '2026-03-20 12:03:53'),
(15, 18, 'OR-1774010847704', '123', 5, 29000, NULL, NULL, '[{"product_id":10,"variation_id":null,"product_name":"POS Test Cabinet Premium","quantity":2,"unit_price":14500,"production_cost":9100}]', NULL, '2026-03-20 12:47:27', '2026-03-20 12:47:27'),
(16, 19, 'OR-1774014005616', 'Jericho', 5, 102000, NULL, NULL, '[{"product_id":8,"variation_id":null,"product_name":"POS Test Cabinet Small","quantity":12,"unit_price":8500,"production_cost":4800}]', NULL, '2026-03-20 13:40:05', '2026-03-20 13:40:05'),
(17, 20, 'OR-1774014131016', 'jericho', 5, 11500, NULL, NULL, '[{"product_id":9,"variation_id":null,"product_name":"POS Test Cabinet Medium","quantity":1,"unit_price":11500,"production_cost":6800}]', NULL, '2026-03-20 13:42:11', '2026-03-20 13:42:11'),
(18, 21, 'OR-1774015361624', 'Jericho', 5, 54400, NULL, NULL, '[{"product_id":7,"variation_id":null,"product_name":"Rustic Pine Cabinet","quantity":8,"unit_price":6800,"production_cost":3500}]', NULL, '2026-03-20 14:02:41', '2026-03-20 14:02:41'),
(19, 22, 'OR-1774015477120', 'Jericho', 5, 24000, NULL, NULL, '[{"product_id":6,"variation_id":null,"product_name":"Modern Walnut Cabinet","quantity":1,"unit_price":12500,"production_cost":6800},{"product_id":9,"variation_id":null,"product_name":"POS Test Cabinet Medium","quantity":1,"unit_price":11500,"production_cost":6800}]', NULL, '2026-03-20 14:04:37', '2026-03-20 14:04:37'),
(20, 23, 'OR-1774015549761', 'Jericho', 5, 21000, NULL, NULL, '[{"product_id":6,"variation_id":null,"product_name":"Modern Walnut Cabinet","quantity":1,"unit_price":12500,"production_cost":6800},{"product_id":5,"variation_id":null,"product_name":"Classic Oak Cabinet","quantity":1,"unit_price":8500,"production_cost":4200}]', NULL, '2026-03-20 14:05:49', '2026-03-20 14:05:49'),
(21, 24, 'OR-1774015577198', 'Jericho', 5, 21000, NULL, NULL, '[{"product_id":5,"variation_id":null,"product_name":"Classic Oak Cabinet","quantity":1,"unit_price":8500,"production_cost":4200},{"product_id":6,"variation_id":null,"product_name":"Modern Walnut Cabinet","quantity":1,"unit_price":12500,"production_cost":6800}]', NULL, '2026-03-20 14:06:17', '2026-03-20 14:06:17'),
(22, 27, 'OR-1774173764512', 'aquino', 5, 32500, NULL, NULL, '[{"product_id":5,"variation_id":null,"product_name":"Classic Oak Cabinet","quantity":1,"unit_price":8500,"production_cost":4200},{"product_id":6,"variation_id":null,"product_name":"Modern Walnut Cabinet","quantity":1,"unit_price":12500,"production_cost":6800},{"product_id":9,"variation_id":null,"product_name":"POS Test Cabinet Medium","quantity":1,"unit_price":11500,"production_cost":6800}]', NULL, '2026-03-22 10:02:44', '2026-03-22 10:02:44'),
(23, 29, 'OR-1774275108546', 'jericho', 5, 23000, NULL, NULL, '[{"key":"9","product_id":9,"variation_id":null,"product_name":"POS Test Cabinet Medium","unit_price":11500,"production_cost":6800,"quantity":2,"max_stock":4}]', NULL, '2026-03-23 14:11:48', '2026-03-23 14:11:48'),
(24, 30, 'OR-1774276209811', 'Robin', 5, 11500, NULL, NULL, '[{"key":"9","product_id":9,"variation_id":null,"product_name":"POS Test Cabinet Medium","unit_price":11500,"production_cost":6800,"quantity":1,"max_stock":2}]', NULL, '2026-03-23 14:30:09', '2026-03-23 14:30:09'),
(25, 34, 'OR-1774276864239', '123', 5, 11500, 12311, 811, '[{"key":"9","product_id":9,"variation_id":null,"product_name":"POS Test Cabinet Medium","unit_price":11500,"production_cost":6800,"quantity":1,"max_stock":1}]', NULL, '2026-03-23 14:41:04', '2026-03-23 14:41:04'),
(26, 36, 'OR-1774352680794', 'Rica', 5, 8480, 10000, 3200, '[{"key":"5","product_id":5,"variation_id":null,"product_name":"Classic Oak Cabinet","unit_price":8500,"production_cost":4200,"quantity":1,"max_stock":10}]', NULL, '2026-03-24 11:44:40', '2026-03-24 11:44:40');

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
) ENGINE=InnoDB AUTO_INCREMENT=35 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

INSERT INTO `stock_movements` (`id`, `material_id`, `product_id`, `type`, `quantity`, `supplier_id`, `order_id`, `order_item_id`, `reference`, `notes`, `created_by`, `created_at`) VALUES
(1, NULL, 10, 'out', 1, NULL, 4, 3, NULL, 'POS walk-in sale', 5, '2026-03-20 04:22:19'),
(2, NULL, 8, 'out', 1, NULL, 5, 4, NULL, 'POS walk-in sale', 5, '2026-03-20 04:29:05'),
(3, NULL, 10, 'out', 1, NULL, 6, 5, NULL, 'POS walk-in sale', 5, '2026-03-20 04:32:26'),
(4, NULL, 10, 'out', 1, NULL, 7, 6, NULL, 'POS walk-in sale', 5, '2026-03-20 04:32:42'),
(5, NULL, 9, 'out', 1, NULL, 8, 7, NULL, 'POS walk-in sale', 5, '2026-03-20 04:34:25'),
(6, NULL, 10, 'out', 1, NULL, 9, 8, NULL, 'POS walk-in sale', 5, '2026-03-20 04:37:06'),
(7, NULL, 10, 'out', 1, NULL, 10, 9, NULL, 'POS walk-in sale', 5, '2026-03-20 04:38:21'),
(8, NULL, 10, 'out', 1, NULL, 11, 10, NULL, 'POS walk-in sale', 5, '2026-03-20 04:45:30'),
(9, NULL, 9, 'out', 1, NULL, 12, 11, NULL, 'POS walk-in sale', 5, '2026-03-20 04:50:11'),
(10, NULL, 9, 'out', 1, NULL, 13, 12, NULL, 'POS walk-in sale', 5, '2026-03-20 04:57:28'),
(11, NULL, 9, 'out', 1, NULL, 14, 13, NULL, 'POS walk-in sale', 5, '2026-03-20 04:58:18'),
(12, NULL, 9, 'out', 1, NULL, 15, 14, NULL, 'POS walk-in sale', 5, '2026-03-20 05:05:47'),
(13, NULL, 8, 'out', 1, NULL, 16, 15, NULL, 'POS walk-in sale', 5, '2026-03-20 12:03:00'),
(14, NULL, 8, 'out', 1, NULL, 17, 16, NULL, 'POS walk-in sale', 5, '2026-03-20 12:03:53'),
(15, NULL, 10, 'out', 2, NULL, 18, 17, NULL, 'POS walk-in sale', 5, '2026-03-20 12:47:27'),
(16, NULL, 8, 'out', 12, NULL, 19, 18, NULL, 'POS walk-in sale', 5, '2026-03-20 13:40:05'),
(17, NULL, 9, 'out', 1, NULL, 20, 19, NULL, 'POS walk-in sale', 5, '2026-03-20 13:42:11'),
(18, NULL, 7, 'out', 8, NULL, 21, 20, NULL, 'POS walk-in sale', 5, '2026-03-20 14:02:41'),
(19, NULL, 6, 'out', 1, NULL, 22, 21, NULL, 'POS walk-in sale', 5, '2026-03-20 14:04:37'),
(20, NULL, 9, 'out', 1, NULL, 22, 22, NULL, 'POS walk-in sale', 5, '2026-03-20 14:04:37'),
(21, NULL, 6, 'out', 1, NULL, 23, 23, NULL, 'POS walk-in sale', 5, '2026-03-20 14:05:49'),
(22, NULL, 5, 'out', 1, NULL, 23, 24, NULL, 'POS walk-in sale', 5, '2026-03-20 14:05:49'),
(23, NULL, 5, 'out', 1, NULL, 24, 25, NULL, 'POS walk-in sale', 5, '2026-03-20 14:06:17'),
(24, NULL, 6, 'out', 1, NULL, 24, 26, NULL, 'POS walk-in sale', 5, '2026-03-20 14:06:17'),
(25, NULL, 5, 'out', 1, NULL, 27, 30, NULL, 'POS walk-in sale', 5, '2026-03-22 10:02:44'),
(26, NULL, 6, 'out', 1, NULL, 27, 31, NULL, 'POS walk-in sale', 5, '2026-03-22 10:02:44'),
(27, NULL, 9, 'out', 1, NULL, 27, 32, NULL, 'POS walk-in sale', 5, '2026-03-22 10:02:44'),
(28, NULL, 9, 'out', 2, NULL, 29, 35, NULL, 'POS walk-in sale', 5, '2026-03-23 14:11:48'),
(29, NULL, 9, 'out', 1, NULL, 30, 36, NULL, 'POS walk-in sale', 5, '2026-03-23 14:30:09'),
(33, NULL, 9, 'out', 1, NULL, 34, 40, NULL, 'POS walk-in sale', 5, '2026-03-23 14:41:04'),
(34, NULL, 5, 'out', 1, NULL, 36, 42, NULL, 'POS walk-in sale', 5, '2026-03-24 11:44:40');

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
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

INSERT INTO `suppliers` (`id`, `name`, `address`, `contact_number`, `email`, `created_at`, `updated_at`) VALUES
(1, '123', '123', '123', '123@gmail.com', '2026-03-21 15:00:13', '2026-03-21 15:00:13');

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
  `reset_otp` varchar(6) DEFAULT NULL,
  `reset_otp_expires` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `email` (`email`),
  KEY `approved_by` (`approved_by`),
  CONSTRAINT `users_ibfk_1` FOREIGN KEY (`approved_by`) REFERENCES `users` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=15 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

INSERT INTO `users` (`id`, `name`, `email`, `pending_email`, `password`, `role`, `phone`, `pending_phone`, `address`, `profile_photo`, `is_verified`, `otp_code`, `otp_expires`, `approval_status`, `approved_by`, `approved_at`, `is_active`, `last_login`, `created_at`, `updated_at`, `reset_otp`, `reset_otp_expires`) VALUES
(1, 'Administrator', 'admin@spiralwood.com', NULL, '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMaX.6IrqJXnq0RbbvO9rGDH9i', 'admin', NULL, NULL, NULL, NULL, 1, NULL, NULL, 'approved', NULL, NULL, 1, NULL, '2026-03-04 14:25:19', '2026-03-04 14:25:19', NULL, NULL),
(2, 'Robin Nicolas', 'robinnicolas032@gmail.com', NULL, '$2a$12$nOzbbfn7HNKmkjCRPikLEePxckfvgPJ6UHpejZPrNyHPSJvjXleou', 'customer', '09766574817', NULL, 'PDM, Marilao, Bulacan', NULL, 1, NULL, NULL, 'approved', NULL, NULL, 1, NULL, '2026-03-09 11:11:58', '2026-03-24 14:59:00', NULL, NULL),
(3, 'John Marc Aquino', 'jmaquino@gmail.com', NULL, '$2a$12$yhvBW8VoieXCf./eIV66LuZABGJL/6QJkX6bp8lt7XQycIlaUm7V6', 'customer', '09766574817', NULL, 'PDM, Marilao, Bulacan', NULL, 0, '643057', '2026-03-09 12:13:47', 'approved', NULL, NULL, 1, NULL, '2026-03-09 11:58:47', '2026-03-24 14:59:00', NULL, NULL),
(4, 'John Marc Aquino', 'baluktottite7@gmail.com', NULL, '$2a$12$RwUTafjoROc5lNgwUxQX7.tI3BC5tyP9sbfYwVg.m.KoKg7a4VftK', 'customer', '09934391473', NULL, 'PDM, Marilao, Bulacan', NULL, 1, NULL, NULL, 'approved', NULL, NULL, 1, '2026-03-12 13:39:26', '2026-03-09 11:59:07', '2026-03-12 13:39:26', NULL, NULL),
(5, 'Staff User', 'staff@gmail.com', NULL, '$2y$12$vg4yYX47in9fGBJn5OLbre7SjN7dEnIB2jFh1Fr1HWOFveVcYSTJO', 'staff', '09123456789', NULL, 'Sample Address', NULL, 1, NULL, NULL, 'approved', NULL, '2026-03-19 09:52:02', 1, '2026-03-24 14:23:23', '2026-03-19 09:52:02', '2026-03-24 14:23:23', NULL, NULL),
(6, 'Admin 3', 'admin3@spiralwood.com', NULL, '$2y$12$XeynMMy8.vDVDtErjY4VZOZ9VRhwwQSrNFPCgSpRNptvW.asvFDW.', 'admin', NULL, NULL, NULL, NULL, 1, NULL, NULL, 'approved', NULL, NULL, 1, '2026-03-29 11:12:02', '2026-03-21 14:45:09', '2026-03-29 11:12:02', NULL, NULL),
(7, 'Sample Customer', 'samplecustomer@gmail.com', NULL, '$2y$12$O8fiAQK3P2G6.rEA.w8wdeQNvI8S.FcfquReFzXga38VJ0zCMR1QO', 'customer', '09123456789', NULL, 'Sample Address', NULL, 1, NULL, NULL, 'approved', NULL, '2026-03-21 16:00:14', 1, '2026-03-24 14:24:44', '2026-03-21 15:42:26', '2026-03-24 14:24:44', NULL, NULL);

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