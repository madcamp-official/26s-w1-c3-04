CREATE TABLE `Sectors` (
	`id`	BIGINT	NOT NULL,
	`group_name`	VARCHAR(50)	NOT NULL,
	`group_order`	INT	NOT NULL,
	`display_order`	INT	NOT NULL,
	`name`	VARCHAR(50)	NOT NULL
);

CREATE TABLE `Device` (
	`id`	BIGINT	NOT NULL,
	`device_uuid`	VARCHAR(36)	NOT NULL,
	`created_at`	TIMESTAMP	NOT NULL
);

CREATE TABLE `Companies` (
	`id`	BIGINT	NOT NULL,
	`name`	VARCHAR(100)	NOT NULL,
	`ticker`	VARCHAR(20)	NOT NULL,
	`logo_url`	VARCHAR(500)	NULL
);

CREATE TABLE `Device_Sector_Subscription` (
	`id`	BIGINT	NOT NULL,
	`device_id`	BIGINT	NOT NULL,
	`sector_id`	BIGINT	NOT NULL
);

CREATE TABLE `Articles` (
	`id`	BIGINT	NOT NULL,
	`source_name`	VARCHAR(100)	NOT NULL,
	`title`	VARCHAR(300)	NOT NULL,
	`source_url`	VARCHAR(1000)	NOT NULL,
	`url_hash`	VARCHAR(64)	NOT NULL,
	`thumbnail_url`	VARCHAR(500)	NULL,
	`summary_headline`	VARCHAR(150)	NULL,
	`summary_body`	TEXT	NULL,
	`importance_reason`	VARCHAR(300)	NULL,
	`final_influence_score`	INT	NULL,
	`is_marketing_pr`	BOOLEAN	NOT NULL	DEFAULT false,
	`like_count`	INT	NOT NULL	DEFAULT 0,
	`published_at`	TIMESTAMP	NOT NULL,
	`company_id_1`	BIGINT	NULL,
	`company_id_2`	BIGINT	NULL,
	`sector_id_1`	BIGINT	NULL,
	`sector_id_2`	BIGINT	NULL
);

CREATE TABLE `Device_Article_Interaction` (
	`id`	BIGINT	NOT NULL,
	`device_id`	BIGINT	NOT NULL,
	`article_id`	BIGINT	NOT NULL,
	`interaction_type`	VARCHAR(20)	NOT NULL,
	`created_at`	TIMESTAMP	NOT NULL
);

CREATE TABLE `User_Company_Subscription` (
	`id`	BIGINT	NOT NULL,
	`device_id`	BIGINT	NOT NULL,
	`company_id`	BIGINT	NOT NULL,
	`subscribed_at`	TIMESTAMP	NULL
);

CREATE TABLE `Story_view_logs` (
	`id`	BIGINT	NOT NULL,
	`device_id`	BIGINT	NOT NULL,
	`company_id`	BIGINT	NOT NULL,
	`last_viewed_at`	TIMESTAMP	NOT NULL
);

CREATE TABLE `Device_Company_View_Logs` (
	`id`	BIGINT	NOT NULL,
	`device_id`	BIGINT	NOT NULL,
	`company_id`	BIGINT	NOT NULL,
	`last_viewed_at`	TIMESTAMP	NOT NULL
);

ALTER TABLE `Sectors` ADD CONSTRAINT `PK_SECTORS` PRIMARY KEY (
	`id`
);

ALTER TABLE `Device` ADD CONSTRAINT `PK_DEVICE` PRIMARY KEY (
	`id`
);

ALTER TABLE `Companies` ADD CONSTRAINT `PK_COMPANIES` PRIMARY KEY (
	`id`
);

ALTER TABLE `Device_Sector_Subscription` ADD CONSTRAINT `PK_DEVICE_SECTOR_SUBSCRIPTION` PRIMARY KEY (
	`id`
);

ALTER TABLE `Articles` ADD CONSTRAINT `PK_ARTICLES` PRIMARY KEY (
	`id`
);

ALTER TABLE `Device_Article_Interaction` ADD CONSTRAINT `PK_DEVICE_ARTICLE_INTERACTION` PRIMARY KEY (
	`id`
);

ALTER TABLE `User_Company_Subscription` ADD CONSTRAINT `PK_USER_COMPANY_SUBSCRIPTION` PRIMARY KEY (
	`id`
);

ALTER TABLE `Story_view_logs` ADD CONSTRAINT `PK_STORY_VIEW_LOGS` PRIMARY KEY (
	`id`
);

ALTER TABLE `Device_Company_View_Logs` ADD CONSTRAINT `PK_DEVICE_COMPANY_VIEW_LOGS` PRIMARY KEY (
	`id`
);

ALTER TABLE `Device_Sector_Subscription` ADD CONSTRAINT `FK_Device_TO_Device_Sector_Subscription_1` FOREIGN KEY (
	`device_id`
)
REFERENCES `Device` (
	`id`
);

ALTER TABLE `Device_Sector_Subscription` ADD CONSTRAINT `FK_Sectors_TO_Device_Sector_Subscription_1` FOREIGN KEY (
	`sector_id`
)
REFERENCES `Sectors` (
	`id`
);

ALTER TABLE `Articles` ADD CONSTRAINT `FK_Companies_TO_Articles_1` FOREIGN KEY (
	`company_id_1`
)
REFERENCES `Companies` (
	`id`
);

ALTER TABLE `Articles` ADD CONSTRAINT `FK_Companies_TO_Articles_2` FOREIGN KEY (
	`company_id_2`
)
REFERENCES `Companies` (
	`id`
);

ALTER TABLE `Articles` ADD CONSTRAINT `FK_Sectors_TO_Articles_1` FOREIGN KEY (
	`sector_id_1`
)
REFERENCES `Sectors` (
	`id`
);

ALTER TABLE `Articles` ADD CONSTRAINT `FK_Sectors_TO_Articles_2` FOREIGN KEY (
	`sector_id_2`
)
REFERENCES `Sectors` (
	`id`
);

ALTER TABLE `Device_Article_Interaction` ADD CONSTRAINT `FK_Device_TO_Device_Article_Interaction_1` FOREIGN KEY (
	`device_id`
)
REFERENCES `Device` (
	`id`
);

ALTER TABLE `Device_Article_Interaction` ADD CONSTRAINT `FK_Articles_TO_Device_Article_Interaction_1` FOREIGN KEY (
	`article_id`
)
REFERENCES `Articles` (
	`id`
);

ALTER TABLE `User_Company_Subscription` ADD CONSTRAINT `FK_Device_TO_User_Company_Subscription_1` FOREIGN KEY (
	`device_id`
)
REFERENCES `Device` (
	`id`
);

ALTER TABLE `User_Company_Subscription` ADD CONSTRAINT `FK_Companies_TO_User_Company_Subscription_1` FOREIGN KEY (
	`company_id`
)
REFERENCES `Companies` (
	`id`
);

ALTER TABLE `Story_view_logs` ADD CONSTRAINT `FK_Device_TO_Story_view_logs_1` FOREIGN KEY (
	`device_id`
)
REFERENCES `Device` (
	`id`
);

ALTER TABLE `Story_view_logs` ADD CONSTRAINT `FK_Companies_TO_Story_view_logs_1` FOREIGN KEY (
	`company_id`
)
REFERENCES `Companies` (
	`id`
);

ALTER TABLE `Device_Company_View_Logs` ADD CONSTRAINT `FK_Device_TO_Device_Company_View_Logs_1` FOREIGN KEY (
	`device_id`
)
REFERENCES `Device` (
	`id`
);

ALTER TABLE `Device_Company_View_Logs` ADD CONSTRAINT `FK_Companies_TO_Device_Company_View_Logs_1` FOREIGN KEY (
	`company_id`
)
REFERENCES `Companies` (
	`id`
);


-- UNIQUE 제약 조건 추가

ALTER TABLE `Device` ADD CONSTRAINT `UQ_DEVICE_UUID` UNIQUE (`device_uuid`);
ALTER TABLE `Companies` ADD CONSTRAINT `UQ_COMPANIES_TICKER` UNIQUE (`ticker`);
ALTER TABLE `Articles` ADD CONSTRAINT `UQ_ARTICLES_URL_HASH` UNIQUE (`url_hash`);
ALTER TABLE `Story_view_logs` ADD CONSTRAINT `UQ_STORY_VIEW_LOGS` UNIQUE (`device_id`, `company_id`);
ALTER TABLE `User_Company_Subscription` ADD CONSTRAINT `UQ_USER_COMPANY_SUBSCRIPTION` UNIQUE (`device_id`, `company_id`);
ALTER TABLE `Device_Article_Interaction` ADD CONSTRAINT `UQ_DEVICE_ARTICLE_INTERACTION` UNIQUE (`device_id`, `article_id`, `interaction_type`);
ALTER TABLE `Device_Sector_Subscription` ADD CONSTRAINT `UQ_DEVICE_SECTOR_SUBSCRIPTION` UNIQUE (`device_id`, `sector_id`);
ALTER TABLE `Device_Company_View_Logs` ADD CONSTRAINT `UQ_DEVICE_COMPANY_VIEW_LOGS` UNIQUE (`device_id`, `company_id`);