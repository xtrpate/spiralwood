-- WISDOM Database Backup
-- Generated: 2026-04-13T16:00:00.464Z

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
  `status` enum('pending','assigned','confirmed','done','rejected','cancelled') DEFAULT 'pending',
  `notes` text DEFAULT NULL,
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `order_id` (`order_id`),
  KEY `assigned_to` (`request_owner_id`),
  KEY `idx_appointments_customer` (`customer_id`),
  KEY `idx_appointments_provider_id` (`provider_id`),
  CONSTRAINT `appointments_ibfk_1` FOREIGN KEY (`order_id`) REFERENCES `orders` (`id`),
  CONSTRAINT `appointments_ibfk_2` FOREIGN KEY (`request_owner_id`) REFERENCES `users` (`id`)
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
) ENGINE=InnoDB AUTO_INCREMENT=8 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

INSERT INTO `backup_logs` (`id`, `type`, `triggered_by`, `file_name`, `file_size_kb`, `storage_path`, `status`, `notes`, `created_at`) VALUES
(1, 'auto', NULL, 'wisdom_backup_auto_2026-04-08T16-00-00-400Z.sql', 45, 'C:\\Users\\User\\Desktop\\robin\\admin\\backend\\backups\\wisdom_backup_auto_2026-04-08T16-00-00-400Z.sql', 'success', NULL, '2026-04-08 16:00:00'),
(2, 'auto', NULL, 'wisdom_backup_auto_2026-04-10T04-00-00-053Z.sql', 55, 'C:\\Users\\User\\Desktop\\robin\\admin\\backend\\backups\\wisdom_backup_auto_2026-04-10T04-00-00-053Z.sql', 'success', NULL, '2026-04-10 04:00:00'),
(3, 'auto', NULL, 'wisdom_backup_auto_2026-04-10T16-00-00-064Z.sql', 82, 'C:\\Users\\User\\Desktop\\robin\\admin\\backend\\backups\\wisdom_backup_auto_2026-04-10T16-00-00-064Z.sql', 'success', NULL, '2026-04-10 16:00:00'),
(4, 'auto', NULL, 'wisdom_backup_auto_2026-04-11T04-00-00-735Z.sql', 83, 'C:\\Users\\User\\Desktop\\robin\\admin\\backend\\backups\\wisdom_backup_auto_2026-04-11T04-00-00-735Z.sql', 'success', NULL, '2026-04-11 04:00:00'),
(5, 'auto', NULL, 'wisdom_backup_auto_2026-04-11T16-00-00-658Z.sql', 297, 'C:\\Users\\User\\Desktop\\robin\\admin\\backend\\backups\\wisdom_backup_auto_2026-04-11T16-00-00-658Z.sql', 'success', NULL, '2026-04-11 16:00:00'),
(6, 'auto', NULL, 'wisdom_backup_auto_2026-04-12T04-00-00-891Z.sql', 146, 'C:\\Users\\User\\Desktop\\robin\\admin\\backend\\backups\\wisdom_backup_auto_2026-04-12T04-00-00-891Z.sql', 'success', NULL, '2026-04-12 04:00:00'),
(7, 'auto', NULL, 'wisdom_backup_auto_2026-04-12T16-00-00-953Z.sql', 810, 'C:\\Users\\User\\Desktop\\robin\\admin\\backend\\backups\\wisdom_backup_auto_2026-04-12T16-00-00-953Z.sql', 'success', NULL, '2026-04-12 16:00:01');

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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

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
  `thumbnail_url` mediumtext DEFAULT NULL,
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
) ENGINE=InnoDB AUTO_INCREMENT=24 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

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
) ENGINE=InnoDB AUTO_INCREMENT=9 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

INSERT INTO `categories` (`id`, `name`, `type`) VALUES
(3, 'Wall Cabinets', 'build'),
(4, 'Base Cabinets', 'build'),
(5, 'Kitchen Cabinets', 'build'),
(6, 'Wardrobes', 'build'),
(7, 'Closets', 'build'),
(8, 'Blueprint Templates', 'blueprint');

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

DROP TABLE IF EXISTS `custom_order_attachments`;
CREATE TABLE `custom_order_attachments` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `order_id` int(11) NOT NULL,
  `order_item_id` int(11) DEFAULT NULL,
  `message_id` int(11) DEFAULT NULL,
  `uploaded_by` int(11) DEFAULT NULL,
  `file_url` text NOT NULL,
  `file_name` varchar(255) DEFAULT NULL,
  `mime_type` varchar(100) DEFAULT NULL,
  `file_size` int(11) DEFAULT NULL,
  `attachment_type` enum('reference_photo','chat_attachment') NOT NULL DEFAULT 'reference_photo',
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_custom_order_attachments_order_id` (`order_id`),
  KEY `idx_custom_order_attachments_order_item_id` (`order_item_id`),
  KEY `idx_custom_order_attachments_message_id` (`message_id`),
  KEY `idx_custom_order_attachments_uploaded_by` (`uploaded_by`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

DROP TABLE IF EXISTS `custom_order_messages`;
CREATE TABLE `custom_order_messages` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `order_id` int(11) NOT NULL,
  `order_item_id` int(11) DEFAULT NULL,
  `sender_id` int(11) DEFAULT NULL,
  `sender_role` enum('customer','admin','staff','system') NOT NULL DEFAULT 'customer',
  `message` text DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_custom_order_messages_order_id` (`order_id`),
  KEY `idx_custom_order_messages_order_item_id` (`order_item_id`),
  KEY `idx_custom_order_messages_sender_id` (`sender_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

DROP TABLE IF EXISTS `custom_request_estimates`;
CREATE TABLE `custom_request_estimates` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `custom_request_id` int(11) NOT NULL,
  `material_cost` decimal(12,2) NOT NULL DEFAULT 0.00,
  `labor_cost` decimal(12,2) NOT NULL DEFAULT 0.00,
  `adjustment_notes` text DEFAULT NULL,
  `grand_total` decimal(12,2) NOT NULL DEFAULT 0.00,
  `status` enum('draft','sent','approved','rejected') NOT NULL DEFAULT 'draft',
  `created_by` int(11) NOT NULL,
  `approved_at` datetime DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

DROP TABLE IF EXISTS `custom_request_images`;
CREATE TABLE `custom_request_images` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `custom_request_id` int(11) NOT NULL,
  `image_url` text NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

DROP TABLE IF EXISTS `custom_request_items`;
CREATE TABLE `custom_request_items` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `custom_request_id` int(11) NOT NULL,
  `product_id` int(11) DEFAULT NULL,
  `product_name` varchar(200) NOT NULL,
  `quantity` int(11) NOT NULL DEFAULT 1,
  `wood_type` varchar(100) DEFAULT NULL,
  `color` varchar(100) DEFAULT NULL,
  `door_style` varchar(100) DEFAULT NULL,
  `hardware` varchar(100) DEFAULT NULL,
  `width` decimal(10,2) DEFAULT NULL,
  `height` decimal(10,2) DEFAULT NULL,
  `depth` decimal(10,2) DEFAULT NULL,
  `comments` text DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

DROP TABLE IF EXISTS `custom_requests`;
CREATE TABLE `custom_requests` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `request_number` varchar(50) NOT NULL,
  `customer_id` int(11) NOT NULL,
  `request_type` enum('template_customization','full_custom') NOT NULL DEFAULT 'template_customization',
  `status` enum('draft','submitted','under_review','estimated','estimate_approved','estimate_rejected','awaiting_down_payment','payment_submitted','payment_verified','ready_for_blueprint','converted_to_order','cancelled') NOT NULL DEFAULT 'submitted',
  `delivery_address` text DEFAULT NULL,
  `notes` text DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `request_number` (`request_number`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

DROP TABLE IF EXISTS `deliveries`;
CREATE TABLE `deliveries` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `order_id` int(11) NOT NULL,
  `driver_id` int(11) DEFAULT NULL,
  `assigned_by` int(11) DEFAULT NULL,
  `assigned_at` datetime DEFAULT NULL,
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
) ENGINE=InnoDB AUTO_INCREMENT=24 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

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
) ENGINE=InnoDB AUTO_INCREMENT=120 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

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
) ENGINE=InnoDB AUTO_INCREMENT=11 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

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
  `customization_json` longtext DEFAULT NULL,
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
) ENGINE=InnoDB AUTO_INCREMENT=85 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

DROP TABLE IF EXISTS `orders`;
CREATE TABLE `orders` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `order_number` varchar(50) DEFAULT NULL,
  `customer_id` int(11) DEFAULT NULL,
  `walkin_customer_name` varchar(150) DEFAULT NULL,
  `walkin_customer_phone` varchar(20) DEFAULT NULL,
  `type` enum('online','walkin') DEFAULT 'online',
  `order_type` enum('standard','blueprint') DEFAULT 'standard',
  `status` enum('pending','confirmed','contract_released','production','shipping','delivered','completed','cancelled') DEFAULT 'pending',
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
  `requested_delivery_date` datetime DEFAULT NULL,
  `delivery_request_notes` text DEFAULT NULL,
  `notes` text DEFAULT NULL,
  `blueprint_id` int(11) DEFAULT NULL,
  `custom_request_id` int(11) DEFAULT NULL,
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
) ENGINE=InnoDB AUTO_INCREMENT=87 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

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
) ENGINE=InnoDB AUTO_INCREMENT=23 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

INSERT INTO `products` (`id`, `barcode`, `name`, `description`, `category_id`, `type`, `image_url`, `is_featured`, `online_price`, `walkin_price`, `production_cost`, `profit_margin`, `stock`, `reorder_point`, `stock_status`, `created_at`, `updated_at`) VALUES
(21, 'CAB-0001', 'Classic Wall Cabinet', 'Classic wall cabinet with upper storage compartments and lower enclosed shelves. Suitable for kitchen, pantry, or utility storage. Made for organized everyday use with a clean modern wood-and-white finish.', 3, 'standard', '/uploads/products/1776095800784-ggz55gktfbl.png', 1, 6500, 6200, 4200, 2000, 50, 10, 'in_stock', '2026-04-13 15:56:40', '2026-04-13 15:56:40'),
(22, 'CLS-0001', 'Modern Storage Closet', 'Modern storage closet with clean white finish, multiple cabinet compartments, and compact space-saving design. Suitable for bedroom, hallway, or utility storage use.', 7, 'standard', '/uploads/products/1776095871011-770xaheshr4.png', 1, 7800, 7500, 5200, 2300, 50, 10, 'in_stock', '2026-04-13 15:57:51', '2026-04-13 15:57:51');

DROP TABLE IF EXISTS `project_tasks`;
CREATE TABLE `project_tasks` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `order_id` int(11) DEFAULT NULL,
  `blueprint_id` int(11) DEFAULT NULL,
  `assigned_to` int(11) NOT NULL,
  `assigned_by` int(11) NOT NULL,
  `task_role` varchar(100) NOT NULL,
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

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
  `staff_type` enum('cashier','indoor','delivery_rider') DEFAULT NULL,
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
) ENGINE=InnoDB AUTO_INCREMENT=12 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

INSERT INTO `users` (`id`, `name`, `email`, `pending_email`, `password`, `role`, `staff_type`, `phone`, `pending_phone`, `address`, `profile_photo`, `is_verified`, `otp_code`, `otp_expires`, `approval_status`, `approved_by`, `approved_at`, `is_active`, `last_login`, `created_at`, `updated_at`, `reset_otp`, `reset_otp_expires`) VALUES
(1, 'System Administrator', 'admin@spiralwood.com', NULL, '$2y$12$4O4lGdDJN61BQdKkUZ9BceRupEJLxmHWKtkj3CRdK9zeYbCw5ky/.', 'admin', NULL, NULL, NULL, NULL, NULL, 1, NULL, NULL, 'approved', NULL, '2026-04-05 05:48:11', 1, '2026-04-13 14:24:59', '2026-04-05 05:48:11', '2026-04-13 14:24:59', NULL, NULL),
(2, 'Adrian Dela Cruz', 'adrian.delacruz@spiralwood.com', NULL, '$2y$12$oYLIeSU5D75WMmswNg23qekJgVgbmCLAHWEedO4nGakIuWMBXMoXq', 'staff', 'indoor', NULL, NULL, NULL, NULL, 1, NULL, NULL, 'approved', 1, '2026-04-05 05:48:11', 1, '2026-04-13 06:47:14', '2026-04-05 05:48:11', '2026-04-13 06:47:14', NULL, NULL),
(3, 'Matthew Salonga', 'matthew.salonga@spiralwood.com', NULL, '$2y$12$oYLIeSU5D75WMmswNg23qekJgVgbmCLAHWEedO4nGakIuWMBXMoXq', 'staff', 'indoor', NULL, NULL, NULL, NULL, 1, NULL, NULL, 'approved', 1, '2026-04-05 05:48:11', 1, '2026-04-12 15:22:23', '2026-04-05 05:48:11', '2026-04-12 15:22:23', NULL, NULL),
(4, 'Ethan Villareal', 'ethan.villareal@spiralwood.com', NULL, '$2y$12$oYLIeSU5D75WMmswNg23qekJgVgbmCLAHWEedO4nGakIuWMBXMoXq', 'staff', 'indoor', NULL, NULL, NULL, NULL, 1, NULL, NULL, 'approved', 1, '2026-04-05 05:48:11', 1, '2026-04-09 10:17:30', '2026-04-05 05:48:11', '2026-04-09 10:17:30', NULL, NULL),
(5, 'Carl Vincent Navarro', 'carl.navarro@spiralwood.com', NULL, '$2y$12$oYLIeSU5D75WMmswNg23qekJgVgbmCLAHWEedO4nGakIuWMBXMoXq', 'staff', 'delivery_rider', NULL, NULL, NULL, NULL, 1, NULL, NULL, 'approved', 1, '2026-04-05 05:48:11', 1, '2026-04-13 10:54:15', '2026-04-05 05:48:11', '2026-04-13 10:54:15', NULL, NULL),
(6, 'Paolo Ramirez', 'paolo.ramirez@spiralwood.com', NULL, '$2y$12$oYLIeSU5D75WMmswNg23qekJgVgbmCLAHWEedO4nGakIuWMBXMoXq', 'staff', 'indoor', NULL, NULL, NULL, NULL, 1, NULL, NULL, 'approved', 1, '2026-04-05 05:48:11', 1, '2026-04-13 10:51:31', '2026-04-05 05:48:11', '2026-04-13 10:51:31', NULL, NULL),
(7, 'Sophia Martinez', 'sophia.martinez@gmail.com', NULL, '$2y$12$hgZYMn1kKk4OGSaA3/2kBuMbeCqaUHUxZjKqmo8x4GM6lBomUgyYu', 'customer', NULL, '09171234611', NULL, 'Prenza 1, Marilao, Bulacan', NULL, 1, NULL, NULL, 'approved', 1, '2026-04-05 05:48:11', 1, '2026-04-10 01:34:12', '2026-04-05 05:48:11', '2026-04-10 01:34:12', NULL, NULL),
(8, 'Daniel Reyes', 'daniel.reyes@gmail.com', NULL, '$2y$12$hgZYMn1kKk4OGSaA3/2kBuMbeCqaUHUxZjKqmo8x4GM6lBomUgyYu', 'customer', NULL, '09171234612', NULL, 'Lias, Marilao, Bulacan', NULL, 1, NULL, NULL, 'approved', 1, '2026-04-05 05:48:11', 1, '2026-04-08 14:54:02', '2026-04-05 05:48:11', '2026-04-08 14:54:02', NULL, NULL),
(9, 'Isabella Cruz', 'isabella.cruz@gmail.com', NULL, '$2y$12$hgZYMn1kKk4OGSaA3/2kBuMbeCqaUHUxZjKqmo8x4GM6lBomUgyYu', 'customer', NULL, '09171234613', NULL, 'Abangan Norte, Marilao, Bulacan', NULL, 1, NULL, NULL, 'approved', 1, '2026-04-05 05:48:11', 1, NULL, '2026-04-05 05:48:11', '2026-04-05 05:48:11', NULL, NULL),
(10, 'Jericho Flores', 'natsukizane4@gmail.com', NULL, '$2a$12$yyDtyDIn1oe43SPepu.nWu0QrQP07knt.NWrs3cYlqTRgCaWzXbPq', 'customer', NULL, '09530695310', NULL, 'Saog Marilao Bulacan', NULL, 1, NULL, NULL, 'approved', NULL, NULL, 1, '2026-04-13 14:42:42', '2026-04-08 12:24:50', '2026-04-13 15:58:59', '716628', '2026-04-13 16:13:59'),
(11, 'Cashier One', 'cashier@spiralwood.com', NULL, '$2y$12$4O4lGdDJN61BQdKkUZ9BceRupEJLxmHWKtkj3CRdK9zeYbCw5ky/.', 'staff', 'cashier', NULL, NULL, NULL, NULL, 1, NULL, NULL, 'approved', 1, '2026-04-10 01:41:59', 1, '2026-04-12 15:59:03', '2026-04-10 01:41:59', '2026-04-12 15:59:03', NULL, NULL);

DROP TABLE IF EXISTS `warranties`;
CREATE TABLE `warranties` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `order_id` int(11) DEFAULT NULL,
  `order_item_id` int(11) DEFAULT NULL,
  `customer_id` int(11) DEFAULT NULL,
  `product_name` varchar(200) DEFAULT NULL,
  `reason` text DEFAULT NULL,
  `admin_note` text DEFAULT NULL,
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

SET FOREIGN_KEY_CHECKS=1;