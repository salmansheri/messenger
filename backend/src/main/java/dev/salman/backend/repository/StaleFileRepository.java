package dev.salman.backend.repository;

import java.util.List;

import org.springframework.data.domain.Limit;
import org.springframework.data.jpa.repository.JpaRepository;

import dev.salman.backend.entity.StaleFile;

public interface StaleFileRepository extends JpaRepository<StaleFile, String> {

	List<StaleFile> findAllByOrderBySinceAsc(Limit limit);

}
