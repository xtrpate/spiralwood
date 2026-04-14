-- WISDOM Database Backup
-- Generated: 2026-04-08T16:00:00.401Z

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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

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
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

INSERT INTO `blueprint_revisions` (`id`, `blueprint_id`, `revision_number`, `stage_at_save`, `revision_data`, `revised_by`, `notes`, `created_at`) VALUES
(1, 2, 1, 'approval', '{"unit":"mm","editorMode":"editable","components":[]}', 1, NULL, '2026-04-06 15:22:31');

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
) ENGINE=InnoDB AUTO_INCREMENT=4 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

INSERT INTO `blueprints` (`id`, `title`, `description`, `base_price`, `wood_type`, `creator_id`, `client_id`, `assigned_staff_id`, `assign_task_type`, `stage`, `design_data`, `view_3d_data`, `locked_fields`, `thumbnail_url`, `source`, `file_url`, `file_type`, `is_template`, `is_gallery`, `is_deleted`, `archived_at`, `created_at`, `updated_at`) VALUES
(2, 'Daniel Reyes Contract Flow Test Blueprint', 'Fresh custom blueprint order to test estimation, payment verification, and contract release flow.', 10000, 'Marine Plywood', 1, 8, NULL, NULL, 'approval', '{"unit":"mm","editorMode":"editable","components":[{"id":"c_1775488950334_u8bdh4","groupId":"g_1775488950334_20jqer","groupLabel":"Wooden Coffee Table 1","groupType":"assembly","partCode":"CT-TOP","category":"Furniture Parts","blueprintStyle":"part","type":"ct_top_panel","label":"Top Panel","x":1980,"y":2720,"z":760,"width":1000,"height":40,"depth":600,"rotationX":0,"rotationY":0,"rotationZ":0,"fill":"#6B4026","material":"Walnut Wood","finish":"walnut-dark","unitPrice":0,"groupUnitPrice":6800,"templateType":"template_coffee_table","qty":1,"locked":false,"cornerRadius":0,"topRatio":0.5},{"id":"c_1775488950334_ehg0rd","groupId":"g_1775488950334_20jqer","groupLabel":"Wooden Coffee Table 1","groupType":"assembly","partCode":"CT-FL","category":"Furniture Parts","blueprintStyle":"part","type":"ct_leg","label":"Front Leg L","x":2040,"y":2740,"z":820,"width":80,"height":420,"depth":80,"rotationX":0,"rotationY":0,"rotationZ":0,"fill":"#6B4026","material":"Walnut Wood","finish":"walnut-dark","unitPrice":0,"groupUnitPrice":6800,"templateType":"template_coffee_table","qty":1,"locked":false,"cornerRadius":0,"topRatio":0.5},{"id":"c_1775488950334_9dxfy7","groupId":"g_1775488950334_20jqer","groupLabel":"Wooden Coffee Table 1","groupType":"assembly","partCode":"CT-FR","category":"Furniture Parts","blueprintStyle":"part","type":"ct_leg","label":"Front Leg R","x":2860,"y":2740,"z":820,"width":80,"height":420,"depth":80,"rotationX":0,"rotationY":0,"rotationZ":0,"fill":"#6B4026","material":"Walnut Wood","finish":"walnut-dark","unitPrice":0,"groupUnitPrice":6800,"templateType":"template_coffee_table","qty":1,"locked":false,"cornerRadius":0,"topRatio":0.5},{"id":"c_1775488950334_ziqcxf","groupId":"g_1775488950334_20jqer","groupLabel":"Wooden Coffee Table 1","groupType":"assembly","partCode":"CT-BL","category":"Furniture Parts","blueprintStyle":"part","type":"ct_leg","label":"Back Leg L","x":2040,"y":2740,"z":1240,"width":80,"height":420,"depth":80,"rotationX":0,"rotationY":0,"rotationZ":0,"fill":"#6B4026","material":"Walnut Wood","finish":"walnut-dark","unitPrice":0,"groupUnitPrice":6800,"templateType":"template_coffee_table","qty":1,"locked":false,"cornerRadius":0,"topRatio":0.5},{"id":"c_1775488950334_9943is","groupId":"g_1775488950334_20jqer","groupLabel":"Wooden Coffee Table 1","groupType":"assembly","partCode":"CT-BR","category":"Furniture Parts","blueprintStyle":"part","type":"ct_leg","label":"Back Leg R","x":2860,"y":2740,"z":1240,"width":80,"height":420,"depth":80,"rotationX":0,"rotationY":0,"rotationZ":0,"fill":"#6B4026","material":"Walnut Wood","finish":"walnut-dark","unitPrice":0,"groupUnitPrice":6800,"templateType":"template_coffee_table","qty":1,"locked":false,"cornerRadius":0,"topRatio":0.5},{"id":"c_1775488950334_oxbiui","groupId":"g_1775488950334_20jqer","groupLabel":"Wooden Coffee Table 1","groupType":"assembly","partCode":"CT-SH","category":"Furniture Parts","blueprintStyle":"part","type":"ct_lower_shelf","label":"Lower Shelf","x":2100,"y":3000,"z":860,"width":780,"height":20,"depth":420,"rotationX":0,"rotationY":0,"rotationZ":0,"fill":"#6B4026","material":"Walnut Wood","finish":"walnut-dark","unitPrice":0,"groupUnitPrice":6800,"templateType":"template_coffee_table","qty":1,"locked":false,"cornerRadius":0,"topRatio":0.5},{"id":"c_1775488950334_rwgios","groupId":"g_1775488950334_20jqer","groupLabel":"Wooden Coffee Table 1","groupType":"assembly","partCode":"CT-AF","category":"Furniture Parts","blueprintStyle":"part","type":"ct_front_apron","label":"Front Apron","x":2100,"y":2740,"z":820,"width":760,"height":80,"depth":20,"rotationX":0,"rotationY":0,"rotationZ":0,"fill":"#6B4026","material":"Walnut Wood","finish":"walnut-dark","unitPrice":0,"groupUnitPrice":6800,"templateType":"template_coffee_table","qty":1,"locked":false,"cornerRadius":0,"topRatio":0.5},{"id":"c_1775488950334_zlf877","groupId":"g_1775488950334_20jqer","groupLabel":"Wooden Coffee Table 1","groupType":"assembly","partCode":"CT-AR","category":"Furniture Parts","blueprintStyle":"part","type":"ct_rear_apron","label":"Rear Apron","x":2100,"y":2740,"z":1280,"width":760,"height":80,"depth":20,"rotationX":0,"rotationY":0,"rotationZ":0,"fill":"#6B4026","material":"Walnut Wood","finish":"walnut-dark","unitPrice":0,"groupUnitPrice":6800,"templateType":"template_coffee_table","qty":1,"locked":false,"cornerRadius":0,"topRatio":0.5}],"importTemplateType":"template_closet_wardrobe","importDimensions":{"w":2400,"h":2400,"d":600},"importComments":"","worldSize":{"w":6400,"h":3200,"d":5200},"sheetSize":{"w":900,"h":580},"exportViews":["3d","front","back","left","right","top","exploded","materials"],"referenceCalibrationByView":{"front":{"points":[],"realDistanceMm":0,"pixelsPerMm":0,"isCalibrated":false},"back":{"points":[],"realDistanceMm":0,"pixelsPerMm":0,"isCalibrated":false},"left":{"points":[],"realDistanceMm":0,"pixelsPerMm":0,"isCalibrated":false},"right":{"points":[],"realDistanceMm":0,"pixelsPerMm":0,"isCalibrated":false},"top":{"points":[],"realDistanceMm":0,"pixelsPerMm":0,"isCalibrated":false}},"traceObjectsByView":{"front":[],"back":[],"left":[],"right":[],"top":[]},"referenceCalibration":{"points":[],"realDistanceMm":0,"pixelsPerMm":0,"isCalibrated":false},"traceObjects":[],"conversionSummary":null,"conversionCutListRows":[]}', '{"camera":"default","objects":[]}', '["overallWidth","overallHeight","overallDepth"]', NULL, 'created', NULL, NULL, 0, 0, 0, NULL, '2026-04-06 15:21:33', '2026-04-06 15:31:29'),
(3, '12213', NULL, 0, NULL, 1, NULL, NULL, NULL, 'design', '{"startMode":"scratch","furnitureType":"cabinet","unit":"mm","editorMode":"editable","importTemplateType":"template_closet_wardrobe","importDimensions":{"w":2400,"h":2400,"d":600},"blueprintSetup":{"startMode":"scratch","furnitureType":"cabinet","overallWidth":2400,"overallHeight":2400,"overallDepth":600,"unit":"mm"},"components":[],"traceObjects":[],"traceObjectsByView":{"front":[],"back":[],"left":[],"right":[],"top":[]},"referenceCalibration":{"points":[],"realDistanceMm":0,"pixelsPerMm":0,"isCalibrated":false},"referenceCalibrationByView":{"front":{"points":[],"realDistanceMm":0,"pixelsPerMm":0,"isCalibrated":false},"back":{"points":[],"realDistanceMm":0,"pixelsPerMm":0,"isCalibrated":false},"left":{"points":[],"realDistanceMm":0,"pixelsPerMm":0,"isCalibrated":false},"right":{"points":[],"realDistanceMm":0,"pixelsPerMm":0,"isCalibrated":false},"top":{"points":[],"realDistanceMm":0,"pixelsPerMm":0,"isCalibrated":false}}}', NULL, NULL, NULL, 'created', NULL, NULL, 0, 0, 0, NULL, '2026-04-07 09:16:45', '2026-04-07 09:16:45');

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
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

INSERT INTO `categories` (`id`, `name`, `type`) VALUES
(1, 'Cabinets', 'build');

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
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

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
) ENGINE=InnoDB AUTO_INCREMENT=4 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

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
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

INSERT INTO `estimations` (`id`, `blueprint_id`, `version`, `material_cost`, `labor_cost`, `labor_breakdown`, `tax`, `discount`, `grand_total`, `estimation_data`, `status`, `pdf_url`, `approved_by`, `approved_at`, `created_at`, `updated_at`) VALUES
(1, 2, 1, 7200, 2800, '[{"label":"Cabinet maker labor","amount":1800},{"label":"Installation labor","amount":1000}]', 0, 0, 10000, '{"summary":"Approved quotation for custom wardrobe project","items":[{"description":"Custom Wardrobe Project","quantity":1,"subtotal":10000}]}', 'approved', '', 8, '2026-04-06 15:21:33', '2026-04-06 15:21:33', '2026-04-06 15:21:33');

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
) ENGINE=InnoDB AUTO_INCREMENT=8 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

INSERT INTO `order_items` (`id`, `order_id`, `product_id`, `variation_id`, `product_name`, `quantity`, `unit_price`, `production_cost`, `profit_margin`, `subtotal`) VALUES
(4, 4, NULL, NULL, 'Custom Wardrobe Project', 1, 10000, 7200, 2800, 10000),
(5, 5, 1, NULL, 'Classic Wall Cabinet', 1, 5500, 3200, 2300, 5500),
(6, 6, 1, NULL, 'Classic Wall Cabinet', 1, 5000, 3200, 1800, 5000),
(7, 7, 1, NULL, 'Classic Wall Cabinet', 3, 5500, NULL, NULL, 16500);

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
) ENGINE=InnoDB AUTO_INCREMENT=8 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

INSERT INTO `orders` (`id`, `order_number`, `customer_id`, `walkin_customer_name`, `walkin_customer_phone`, `type`, `order_type`, `status`, `payment_method`, `payment_status`, `subtotal`, `tax`, `discount`, `total`, `cash_received`, `change`, `down_payment`, `payment_proof`, `delivery_address`, `notes`, `blueprint_id`, `cancellation_reason`, `cancelled_at`, `refund_amount`, `refund_status`, `created_at`, `updated_at`) VALUES
(4, 'SWS-CONTRACT-TEST-0004', 8, NULL, NULL, 'online', 'blueprint', 'pending', 'gcash', 'unpaid', 10000, 0, 0, 10000, NULL, 0, 3000, '/uploads/payments/contract-flow-dp-proof.jpg', 'Lias, Marilao, Bulacan', 'Fresh custom order from start for contract flow testing.', 2, NULL, NULL, 0, 'none', '2026-04-06 15:21:33', '2026-04-06 15:31:29'),
(5, 'SWS-GCASH-DEMO-0005', 8, NULL, NULL, 'online', 'standard', 'pending', 'gcash', 'unpaid', 5500, 0, 0, 5500, NULL, 0, 0, '/uploads/payments/gcash-demo-proof-0005.jpg', 'Lias, Marilao, Bulacan', 'Fresh online GCash demo order for manual flow testing.', NULL, NULL, NULL, 0, 'none', '2026-04-06 15:41:53', '2026-04-06 15:41:53'),
(6, 'WLK-GCASH-DEMO-0006', NULL, 'Walk-in GCash Demo Customer', '09179990006', 'walkin', 'standard', 'confirmed', 'gcash', 'paid', 5000, 0, 0, 5000, 5000, 0, 0, '/uploads/payments/wlk-gcash-demo-0006.jpg', 'Prenza 1, Marilao, Bulacan', 'Fresh walk-in paid demo order for manual status flow.', NULL, NULL, NULL, 0, 'none', '2026-04-06 15:44:22', '2026-04-06 15:44:22'),
(7, 'SWS-20260408-8506', 10, 'Jericho Flores', '09530695310', 'online', 'standard', 'pending', 'cod', 'unpaid', 16500, 0, 0, 16500, NULL, 0, 0, NULL, 'Saog Marilao Bulacan', '', NULL, NULL, NULL, 0, 'none', '2026-04-08 12:26:49', '2026-04-08 12:26:49');

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
) ENGINE=InnoDB AUTO_INCREMENT=11 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

INSERT INTO `payment_transactions` (`id`, `order_id`, `amount`, `payment_method`, `proof_url`, `verified_by`, `verified_at`, `status`, `notes`, `created_at`) VALUES
(8, 4, 3000, 'gcash', '/uploads/payments/contract-flow-dp-proof.jpg', NULL, NULL, 'pending', '30% down payment uploaded by customer, awaiting admin verification.', '2026-04-06 15:31:29'),
(9, 5, 5500, 'gcash', '/uploads/payments/gcash-demo-proof-0005.jpg', NULL, NULL, 'pending', 'GCash payment uploaded by customer, awaiting admin verification.', '2026-04-06 15:41:53'),
(10, 6, 5000, 'gcash', '/uploads/payments/wlk-gcash-demo-0006.jpg', 1, '2026-04-06 15:44:23', 'verified', 'Walk-in GCash payment already verified for demo flow.', '2026-04-06 15:44:23');

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
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

INSERT INTO `products` (`id`, `barcode`, `name`, `description`, `category_id`, `type`, `image_url`, `is_featured`, `online_price`, `walkin_price`, `production_cost`, `profit_margin`, `stock`, `reorder_point`, `stock_status`, `created_at`, `updated_at`) VALUES
(1, 'SWS-CAB-001', 'Classic Wall Cabinet', 'Fresh retest seed product after database cleanup', 1, 'standard', NULL, 0, 5500, 5000, 3200, 1800, 6, 2, 'in_stock', '2026-04-06 14:45:15', '2026-04-08 12:26:49');

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
) ENGINE=InnoDB AUTO_INCREMENT=4 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

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
) ENGINE=InnoDB AUTO_INCREMENT=3 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

INSERT INTO `receipts` (`id`, `order_id`, `receipt_number`, `issued_to`, `issued_by`, `total_amount`, `cash_received`, `change_amount`, `items_snapshot`, `signature_url`, `printed_at`, `created_at`) VALUES
(2, 6, 'OR-WLK-GCASH-0006', 'Walk-in GCash Demo Customer', 1, 5000, 5000, 0, '[{"product_name":"Classic Wall Cabinet","quantity":1,"unit_price":5000}]', '', '2026-04-06 15:44:23', '2026-04-06 15:44:23');

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
) ENGINE=InnoDB AUTO_INCREMENT=3 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

INSERT INTO `stock_movements` (`id`, `material_id`, `product_id`, `type`, `quantity`, `supplier_id`, `order_id`, `order_item_id`, `reference`, `notes`, `created_by`, `created_at`) VALUES
(2, NULL, 1, 'out', 1, NULL, 6, 6, 'WLK-GCASH-DEMO-0006', 'Walk-in GCash paid demo sale.', 1, '2026-04-06 15:44:23');

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
  `reset_otp` varchar(6) DEFAULT NULL,
  `reset_otp_expires` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `email` (`email`),
  KEY `approved_by` (`approved_by`),
  CONSTRAINT `users_ibfk_1` FOREIGN KEY (`approved_by`) REFERENCES `users` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=11 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

INSERT INTO `users` (`id`, `name`, `email`, `pending_email`, `password`, `role`, `phone`, `pending_phone`, `address`, `profile_photo`, `is_verified`, `otp_code`, `otp_expires`, `approval_status`, `approved_by`, `approved_at`, `is_active`, `last_login`, `created_at`, `updated_at`, `reset_otp`, `reset_otp_expires`) VALUES
(1, 'System Administrator', 'admin@spiralwood.com', NULL, '$2y$12$4O4lGdDJN61BQdKkUZ9BceRupEJLxmHWKtkj3CRdK9zeYbCw5ky/.', 'admin', NULL, NULL, NULL, NULL, 1, NULL, NULL, 'approved', NULL, '2026-04-05 05:48:11', 1, '2026-04-08 15:11:01', '2026-04-05 05:48:11', '2026-04-08 15:11:01', NULL, NULL),
(2, 'Adrian Dela Cruz', 'adrian.delacruz@spiralwood.com', NULL, '$2y$12$oYLIeSU5D75WMmswNg23qekJgVgbmCLAHWEedO4nGakIuWMBXMoXq', 'staff', NULL, NULL, NULL, NULL, 1, NULL, NULL, 'approved', 1, '2026-04-05 05:48:11', 1, '2026-04-08 15:10:48', '2026-04-05 05:48:11', '2026-04-08 15:10:48', NULL, NULL),
(3, 'Matthew Salonga', 'matthew.salonga@spiralwood.com', NULL, '$2y$12$oYLIeSU5D75WMmswNg23qekJgVgbmCLAHWEedO4nGakIuWMBXMoXq', 'staff', NULL, NULL, NULL, NULL, 1, NULL, NULL, 'approved', 1, '2026-04-05 05:48:11', 1, NULL, '2026-04-05 05:48:11', '2026-04-05 05:48:11', NULL, NULL),
(4, 'Ethan Villareal', 'ethan.villareal@spiralwood.com', NULL, '$2y$12$oYLIeSU5D75WMmswNg23qekJgVgbmCLAHWEedO4nGakIuWMBXMoXq', 'staff', NULL, NULL, NULL, NULL, 1, NULL, NULL, 'approved', 1, '2026-04-05 05:48:11', 1, NULL, '2026-04-05 05:48:11', '2026-04-05 05:48:11', NULL, NULL),
(5, 'Carl Vincent Navarro', 'carl.navarro@spiralwood.com', NULL, '$2y$12$oYLIeSU5D75WMmswNg23qekJgVgbmCLAHWEedO4nGakIuWMBXMoXq', 'staff', NULL, NULL, NULL, NULL, 1, NULL, NULL, 'approved', 1, '2026-04-05 05:48:11', 1, NULL, '2026-04-05 05:48:11', '2026-04-05 05:48:11', NULL, NULL),
(6, 'Paolo Ramirez', 'paolo.ramirez@spiralwood.com', NULL, '$2y$12$oYLIeSU5D75WMmswNg23qekJgVgbmCLAHWEedO4nGakIuWMBXMoXq', 'staff', NULL, NULL, NULL, NULL, 1, NULL, NULL, 'approved', 1, '2026-04-05 05:48:11', 1, NULL, '2026-04-05 05:48:11', '2026-04-05 05:48:11', NULL, NULL),
(7, 'Sophia Martinez', 'sophia.martinez@gmail.com', NULL, '$2y$12$hgZYMn1kKk4OGSaA3/2kBuMbeCqaUHUxZjKqmo8x4GM6lBomUgyYu', 'customer', '09171234611', NULL, 'Prenza 1, Marilao, Bulacan', NULL, 1, NULL, NULL, 'approved', 1, '2026-04-05 05:48:11', 1, '2026-04-08 15:12:28', '2026-04-05 05:48:11', '2026-04-08 15:12:28', NULL, NULL),
(8, 'Daniel Reyes', 'daniel.reyes@gmail.com', NULL, '$2y$12$hgZYMn1kKk4OGSaA3/2kBuMbeCqaUHUxZjKqmo8x4GM6lBomUgyYu', 'customer', '09171234612', NULL, 'Lias, Marilao, Bulacan', NULL, 1, NULL, NULL, 'approved', 1, '2026-04-05 05:48:11', 1, '2026-04-08 14:54:02', '2026-04-05 05:48:11', '2026-04-08 14:54:02', NULL, NULL),
(9, 'Isabella Cruz', 'isabella.cruz@gmail.com', NULL, '$2y$12$hgZYMn1kKk4OGSaA3/2kBuMbeCqaUHUxZjKqmo8x4GM6lBomUgyYu', 'customer', '09171234613', NULL, 'Abangan Norte, Marilao, Bulacan', NULL, 1, NULL, NULL, 'approved', 1, '2026-04-05 05:48:11', 1, NULL, '2026-04-05 05:48:11', '2026-04-05 05:48:11', NULL, NULL),
(10, 'Jericho Flores', 'natsukizane4@gmail.com', NULL, '$2a$12$dbl/MQYmrmfAXK8sK/0SNuDBwA/O07au4PQu86sRqIltm7U/so12S', 'customer', '09530695310', NULL, 'Saog Marilao Bulacan', NULL, 1, NULL, NULL, 'approved', NULL, NULL, 1, '2026-04-08 12:25:38', '2026-04-08 12:24:50', '2026-04-08 12:25:38', NULL, NULL);

DROP TABLE IF EXISTS `warranties`;
CREATE TABLE `warranties` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `order_id` int(11) DEFAULT NULL,
  `order_item_id` int(11) DEFAULT NULL,
  `customer_id` int(11) DEFAULT NULL,
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

SET FOREIGN_KEY_CHECKS=1;