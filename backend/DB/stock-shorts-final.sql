-- 분야 테이블
CREATE TABLE `Sectors` (
	`id`		BIGINT		NOT NULL	AUTO_INCREMENT,
	`group_name`	VARCHAR(50)	NOT NULL,
	`group_order`	INT		NOT NULL,
	`display_order`	INT		NOT NULL,
	`name`		VARCHAR(50)	NOT NULL,
	PRIMARY KEY (`id`)
);
 
-- 디바이스(사용자 단말) 테이블
CREATE TABLE `Device` (
	`id`		BIGINT		NOT NULL	AUTO_INCREMENT,
	`device_uuid`	VARCHAR(36)	NOT NULL,
	`created_at`	TIMESTAMP	NOT NULL,
	PRIMARY KEY (`id`),
	UNIQUE KEY `UQ_DEVICE_UUID` (`device_uuid`)
);
 
-- 회사(종목) 테이블
CREATE TABLE `Companies` (
	`id`		BIGINT		NOT NULL	AUTO_INCREMENT,
	`name`		VARCHAR(100)	NOT NULL,
	`ticker`	VARCHAR(20)	NOT NULL,
	PRIMARY KEY (`id`),
	UNIQUE KEY `UQ_COMPANIES_TICKER` (`ticker`)
);
 
-- 디바이스별 분야 구독 테이블
CREATE TABLE `Device_Sector_Subscription` (
	`id`		BIGINT	NOT NULL	AUTO_INCREMENT,
	`device_id`	BIGINT	NOT NULL,	-- Device.id 참조
	`sector_id`	BIGINT	NOT NULL,	-- Sectors.id 참조
	PRIMARY KEY (`id`),
	UNIQUE KEY `UQ_DEVICE_SECTOR_SUBSCRIPTION` (`device_id`, `sector_id`),
	CONSTRAINT `FK_Device_TO_Device_Sector_Subscription_1`
		FOREIGN KEY (`device_id`) REFERENCES `Device` (`id`),
	CONSTRAINT `FK_Sectors_TO_Device_Sector_Subscription_1`
		FOREIGN KEY (`sector_id`) REFERENCES `Sectors` (`id`)
);
 
-- 기사(뉴스) 테이블
CREATE TABLE `Articles` (
	`id`			BIGINT		NOT NULL	AUTO_INCREMENT,
	`source_name`		VARCHAR(100)	NOT NULL,
	`title`			VARCHAR(300)	NOT NULL,
	`source_url`		VARCHAR(1000)	NOT NULL,
	`url_hash`		VARCHAR(64)	NOT NULL,
	`thumbnail_url`		VARCHAR(500)	NULL,
	`summary_headline`	VARCHAR(150)	NULL,
	`summary_body`		TEXT		NULL,
	`importance_reason`	VARCHAR(300)	NULL,
	`like_count`		INT		NOT NULL	DEFAULT 0,
	`published_at`		TIMESTAMP	NOT NULL,
	`company_id_1`		BIGINT		NULL,		-- Companies.id 참조 (관련 기업 1)
	`company_id_2`		BIGINT		NULL,		-- Companies.id 참조 (관련 기업 2)
	`sector_id_1`		BIGINT		NULL,		-- Sectors.id 참조 (관련 섹터 1)
	`sector_id_2`		BIGINT		NULL,		-- Sectors.id 참조 (관련 섹터 2)
	PRIMARY KEY (`id`),
	UNIQUE KEY `UQ_ARTICLES_URL_HASH` (`url_hash`),
	INDEX `IX_ARTICLES_COMPANY_ID` (`company_id_1`, `company_id_2`), -- 기업별 기사 조회용
	INDEX `IX_ARTICLES_SECTOR_ID` (`sector_id_1`, `sector_id_2`), -- 분야별 기사 조회용
	CONSTRAINT `FK_Companies_TO_Articles_1`
		FOREIGN KEY (`company_id_1`) REFERENCES `Companies` (`id`),
	CONSTRAINT `FK_Companies_TO_Articles_2`
		FOREIGN KEY (`company_id_2`) REFERENCES `Companies` (`id`),
	CONSTRAINT `FK_Sectors_TO_Articles_1`
		FOREIGN KEY (`sector_id_1`) REFERENCES `Sectors` (`id`),
	CONSTRAINT `FK_Sectors_TO_Articles_2`
		FOREIGN KEY (`sector_id_2`) REFERENCES `Sectors` (`id`)
);
 
-- 디바이스별 기사 인터랙션(좋아요/스크랩 등) 테이블
CREATE TABLE `Device_Article_Interaction` (
	`id`			BIGINT		NOT NULL	AUTO_INCREMENT,
	`device_id`		BIGINT		NOT NULL,	-- Device.id 참조
	`article_id`		BIGINT		NOT NULL,	-- Articles.id 참조
	`interaction_type`	VARCHAR(20)	NOT NULL,	-- 좋아요, 스크랩, 열람
	`created_at`		TIMESTAMP	NOT NULL,
	PRIMARY KEY (`id`),
	UNIQUE KEY `UQ_DEVICE_ARTICLE_INTERACTION` (`device_id`, `article_id`, `interaction_type`),
	CONSTRAINT `FK_Device_TO_Device_Article_Interaction_1`
		FOREIGN KEY (`device_id`) REFERENCES `Device` (`id`),
	CONSTRAINT `FK_Articles_TO_Device_Article_Interaction_1`
		FOREIGN KEY (`article_id`) REFERENCES `Articles` (`id`)
);
 
-- 디바이스별 기업 구독 테이블
CREATE TABLE `User_Company_Subscription` (
	`id`		BIGINT		NOT NULL	AUTO_INCREMENT,
	`device_id`	BIGINT		NOT NULL,	-- Device.id 참조
	`company_id`	BIGINT		NOT NULL,	-- Companies.id 참조
	`subscribed_at`	TIMESTAMP	NULL,
	PRIMARY KEY (`id`),
	UNIQUE KEY `UQ_USER_COMPANY_SUBSCRIPTION` (`device_id`, `company_id`),
	CONSTRAINT `FK_Device_TO_User_Company_Subscription_1`
		FOREIGN KEY (`device_id`) REFERENCES `Device` (`id`),
	CONSTRAINT `FK_Companies_TO_User_Company_Subscription_1`
		FOREIGN KEY (`company_id`) REFERENCES `Companies` (`id`)
);
 
-- 스토리(기업 상세) 열람 기록 테이블
CREATE TABLE `Story_view_logs` (
	`id`			BIGINT		NOT NULL	AUTO_INCREMENT,
	`device_id`		BIGINT		NOT NULL,	-- Device.id 참조
	`company_id`		BIGINT		NOT NULL,	-- Companies.id 참조
	`last_viewed_article_id`	BIGINT		NULL,	-- Articles.id 참조
	PRIMARY KEY (`id`),
	UNIQUE KEY `UQ_STORY_VIEW_LOGS` (`device_id`, `company_id`),
	CONSTRAINT `FK_Device_TO_Story_view_logs_1`
		FOREIGN KEY (`device_id`) REFERENCES `Device` (`id`),
	CONSTRAINT `FK_Companies_TO_Story_view_logs_1`
		FOREIGN KEY (`company_id`) REFERENCES `Companies` (`id`),
	CONSTRAINT `FK_Articles_TO_Story_view_logs_1`
    	FOREIGN KEY (`last_viewed_article_id`) REFERENCES `Articles` (`id`)
);
 
-- 차트 열람 기록 테이블
CREATE TABLE `Device_Company_View_Logs` (
	`id`			BIGINT		NOT NULL	AUTO_INCREMENT,
	`device_id`		BIGINT		NOT NULL,	-- Device.id 참조
	`company_id`		BIGINT		NOT NULL,	-- Companies.id 참조
	`last_viewed_at`	TIMESTAMP	NOT NULL,
	PRIMARY KEY (`id`),
	UNIQUE KEY `UQ_DEVICE_COMPANY_VIEW_LOGS` (`device_id`, `company_id`),
	CONSTRAINT `FK_Device_TO_Device_Company_View_Logs_1`
		FOREIGN KEY (`device_id`) REFERENCES `Device` (`id`),
	CONSTRAINT `FK_Companies_TO_Device_Company_View_Logs_1`
		FOREIGN KEY (`company_id`) REFERENCES `Companies` (`id`)
);