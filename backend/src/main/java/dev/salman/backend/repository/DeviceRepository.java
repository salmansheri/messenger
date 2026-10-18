package dev.salman.backend.repository;

import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.transaction.annotation.Transactional;

import dev.salman.backend.entity.Device;

public interface DeviceRepository extends JpaRepository<Device, UUID> {

	Optional<Device> findByToken(String token);

	long countByUserId(UUID userId);

	List<Device> findByUserIdIn(Collection<UUID> userIds);

	@Transactional
	@Modifying
	void deleteByIdAndUserId(UUID id, UUID userId);

	@Transactional
	@Modifying
	void deleteByToken(String token);

	/** Makes concurrent registrations of the same token run one after the other (released at commit). */
	@Query(value = "select count(*) from (select pg_advisory_xact_lock(hashtextextended(:token, 1))) locked",
			nativeQuery = true)
	long lockToken(String token);

}
