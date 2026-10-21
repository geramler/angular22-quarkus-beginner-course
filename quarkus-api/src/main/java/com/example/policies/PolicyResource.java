package com.example.policies;

import io.quarkus.panache.common.Sort;
import jakarta.annotation.security.RolesAllowed;
import jakarta.transaction.Transactional;
import jakarta.ws.rs.Consumes;
import jakarta.ws.rs.DELETE;
import jakarta.ws.rs.GET;
import jakarta.ws.rs.NotFoundException;
import jakarta.ws.rs.POST;
import jakarta.ws.rs.PUT;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.PathParam;
import jakarta.ws.rs.Produces;
import jakarta.ws.rs.core.MediaType;
import jakarta.ws.rs.core.Response;
import org.eclipse.microprofile.openapi.annotations.security.SecurityRequirement;
import org.eclipse.microprofile.openapi.annotations.tags.Tag;

import java.util.List;

@Path("/api/policies")
@Tag(name = "Policies")
@SecurityRequirement(name = "bearerAuth")
@RolesAllowed({"USER", "ADMIN"})
@Consumes(MediaType.APPLICATION_JSON)
@Produces(MediaType.APPLICATION_JSON)
public class PolicyResource {
    @GET
    public List<Policy> findAll() {
        return Policy.listAll(Sort.by("id"));
    }

    @GET
    @Path("/{id}")
    public Policy findById(@PathParam("id") Long id) {
        return findPolicy(id);
    }

    @POST
    @RolesAllowed("ADMIN")
    @Transactional
    public Response create(PolicyRequest request) {
        Policy policy = new Policy();
        policy.policyNumber = request.policyNumber();
        policy.customerName = request.customerName();
        policy.status = request.status();
        policy.persist();
        return Response.status(Response.Status.CREATED).entity(policy).build();
    }

    @PUT
    @RolesAllowed("ADMIN")
    @Path("/{id}")
    @Transactional
    public Policy update(@PathParam("id") Long id, PolicyRequest request) {
        Policy policy = findPolicy(id);
        policy.policyNumber = request.policyNumber();
        policy.customerName = request.customerName();
        policy.status = request.status();
        return policy;
    }

    @DELETE
    @RolesAllowed("ADMIN")
    @Path("/{id}")
    @Transactional
    public Response delete(@PathParam("id") Long id) {
        if (!Policy.deleteById(id)) {
            throw new NotFoundException("Policy not found");
        }
        return Response.noContent().build();
    }

    private Policy findPolicy(Long id) {
        Policy policy = Policy.findById(id);
        if (policy == null) {
            throw new NotFoundException("Policy not found");
        }
        return policy;
    }

    public record PolicyRequest(String policyNumber, String customerName, String status) {
    }
}
